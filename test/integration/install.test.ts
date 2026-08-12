import assert from "node:assert/strict";
import { chmod, cp, lstat, mkdir, mkdtemp, readFile, readlink, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { applyPlan, rollbackLatest, uninstallAll } from "../../src/executor.js";
import { buildInstallPlan } from "../../src/planner.js";
import type { GlobalOptions } from "../../src/types.js";

const root = process.cwd();

test("minimal install is reversible and idempotent", async () => {
  const home = await mkdtemp(join(tmpdir(), "orditra-home-"));
  const bin = join(home, "bin");
  const originalPath = process.env.PATH;
  try {
    await import("node:fs/promises").then(({ mkdir }) => mkdir(bin, { recursive: true }));
    for (const name of ["codex", "claude", "opencode"]) {
      const target = join(bin, name);
      await writeFile(target, "#!/bin/sh\necho test-client 1.0.0\n", "utf8");
      await chmod(target, 0o755);
    }
    process.env.PATH = bin;
    const options: GlobalOptions = { home, root, preset: "minimal", dryRun: false, json: false, yes: true, skipExternal: true };
    const first = await buildInstallPlan(options);
    assert.ok(first.items.some((item) => item.kind === "write"));
    const manifest = await applyPlan(first, options);
    assert.ok(manifest);
    assert.match(await readFile(join(home, ".codex", "AGENTS.md"), "utf8"), /orditra:start/);
    assert.ok((await lstat(join(home, ".agents", "skills", "workflow-router"))).isSymbolicLink());
    assert.ok((await lstat(join(home, ".claude", "skills", "workflow-router"))).isSymbolicLink());

    const second = await buildInstallPlan(options);
    assert.deepEqual(second.items, []);

    await rollbackLatest(options);
    await assert.rejects(lstat(join(home, ".codex", "AGENTS.md")));
    await assert.rejects(lstat(join(home, ".agents", "skills", "workflow-router")));
  } finally {
    process.env.PATH = originalPath;
    await rm(home, { recursive: true, force: true });
  }
});

test("legacy pre-release manifest history migrates into the Orditra uninstall chain", async () => {
  const home = await mkdtemp(join(tmpdir(), "orditra-history-migration-"));
  const originalPath = process.env.PATH;
  try {
    process.env.PATH = "";
    await mkdir(join(home, ".codex"), { recursive: true });
    const legacyState = join(home, ".local", "state", "agentflow-kit");
    const legacyBackup = join(legacyState, "backups", "legacy");
    const legacyManifestPath = join(legacyBackup, "manifest.json");
    const legacyManifest = {
      schemaVersion: 1,
      toolkitVersion: "0.1.0",
      createdAt: "2026-01-01T00:00:00.000Z",
      preset: "minimal",
      backupDir: legacyBackup,
      snapshots: [],
      commands: [],
      ownedSymlinks: [],
    };
    await mkdir(legacyBackup, { recursive: true });
    await writeFile(legacyManifestPath, `${JSON.stringify(legacyManifest)}\n`, "utf8");
    await writeFile(join(legacyState, "manifest-history.json"), `${JSON.stringify([legacyManifestPath])}\n`, "utf8");

    const options: GlobalOptions = { home, root, preset: "minimal", dryRun: false, json: false, yes: true, skipExternal: true };
    await applyPlan(await buildInstallPlan(options), options);
    const currentHistoryPath = join(home, ".local", "state", "orditra", "manifest-history.json");
    const currentHistory = JSON.parse(await readFile(currentHistoryPath, "utf8")) as string[];
    assert.equal(currentHistory.length, 2);
    await assert.rejects(lstat(join(legacyState, "manifest-history.json")));
    assert.equal((await uninstallAll({ ...options, dryRun: true })).length, 2);
    await uninstallAll(options);
    await assert.rejects(lstat(currentHistoryPath));
  } finally {
    process.env.PATH = originalPath;
    await rm(home, { recursive: true, force: true });
  }
});

test("content-identical unmanaged skills are safely adopted as shared symlinks", async () => {
  const home = await mkdtemp(join(tmpdir(), "orditra-adopt-"));
  const originalPath = process.env.PATH;
  try {
    process.env.PATH = "";
    await import("node:fs/promises").then(({ mkdir }) => mkdir(join(home, ".codex"), { recursive: true }));
    const skill = join(home, ".agents", "skills", "workflow-router");
    await import("node:fs/promises").then(({ mkdir }) => mkdir(join(home, ".agents", "skills"), { recursive: true }));
    await cp(join(root, "skills", "workflow-router"), skill, { recursive: true });
    const options: GlobalOptions = { home, root, preset: "minimal", dryRun: false, json: false, yes: true, skipExternal: true };
    const first = await buildInstallPlan(options);
    await applyPlan(first, options);

    const adoption = await buildInstallPlan(options);
    const item = adoption.items.find((candidate) => candidate.kind === "symlink" && candidate.target === skill);
    assert.ok(item?.kind === "symlink" && item.replaceExisting);
    await applyPlan(adoption, options);
    assert.ok((await lstat(skill)).isSymbolicLink());
    await uninstallAll(options);
    assert.ok((await lstat(skill)).isDirectory());
    assert.match(await readFile(join(skill, "SKILL.md"), "utf8"), /name: workflow-router/);
    await assert.rejects(lstat(join(home, ".codex", "AGENTS.md")));
  } finally {
    process.env.PATH = originalPath;
    await rm(home, { recursive: true, force: true });
  }
});

test("skills linked to a previous Orditra release upgrade automatically", async () => {
  const home = await mkdtemp(join(tmpdir(), "orditra-release-upgrade-"));
  const originalPath = process.env.PATH;
  try {
    process.env.PATH = "";
    await mkdir(join(home, ".codex"), { recursive: true });
    await mkdir(join(home, ".claude"), { recursive: true });
    const options: GlobalOptions = { home, root, preset: "minimal", dryRun: false, json: false, yes: true, skipExternal: true };
    const initial = await buildInstallPlan(options);
    await applyPlan(initial, options);

    const currentSkill = join(initial.releaseDir, "skills", "workflow-router");
    const previousSkill = join(home, ".local", "share", "orditra", "releases", "0.0.0", "skills", "workflow-router");
    await mkdir(join(previousSkill, ".."), { recursive: true });
    await cp(currentSkill, previousSkill, { recursive: true });
    for (const target of [join(home, ".agents", "skills", "workflow-router"), join(home, ".claude", "skills", "workflow-router")]) {
      await rm(target);
      await symlink(previousSkill, target);
    }

    const upgrade = await buildInstallPlan(options);
    const replacements = upgrade.items.filter((item) => item.kind === "symlink" && item.source === currentSkill);
    assert.equal(replacements.length, 2);
    assert.ok(replacements.every((item) => item.kind === "symlink" && item.replaceExisting));
    assert.equal(upgrade.items.filter((item) => item.kind === "notice" && item.id.endsWith("-conflict")).length, 0);

    await applyPlan(upgrade, options);
    assert.equal(await readlink(join(home, ".agents", "skills", "workflow-router")), currentSkill);
    assert.equal(await readlink(join(home, ".claude", "skills", "workflow-router")), currentSkill);
    assert.deepEqual((await buildInstallPlan(options)).items, []);

    const externalSkill = join(home, "custom-skills", "workflow-router");
    const agentsSkill = join(home, ".agents", "skills", "workflow-router");
    await mkdir(join(externalSkill, ".."), { recursive: true });
    await cp(currentSkill, externalSkill, { recursive: true });
    await rm(agentsSkill);
    await symlink(externalSkill, agentsSkill);
    const protectedExternal = await buildInstallPlan(options);
    assert.ok(protectedExternal.items.some((item) => item.kind === "notice" && item.id === "agents-skill-workflow-router-conflict"));
    assert.ok(!protectedExternal.items.some((item) => item.kind === "symlink" && item.target === agentsSkill));
  } finally {
    process.env.PATH = originalPath;
    await rm(home, { recursive: true, force: true });
  }
});
