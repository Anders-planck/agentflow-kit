import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmod, cp, lstat, mkdir, mkdtemp, readFile, readlink, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import test from "node:test";

import { applyPlan, rollbackLatest, uninstallAll } from "../../src/executor.js";
import { buildInstallPlan } from "../../src/planner.js";
import { loadPreset } from "../../src/registry.js";
import type { GlobalOptions, InstallPlan } from "../../src/types.js";

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

test("recommended plan configures Context7 through every client adapter", async () => {
  const home = await mkdtemp(join(tmpdir(), "orditra-context7-"));
  const bin = join(home, "bin");
  const originalPath = process.env.PATH;
  try {
    await mkdir(bin, { recursive: true });
    for (const name of ["codex", "claude", "opencode", "uvx", "node", "sg"]) {
      const target = join(bin, name);
      await writeFile(target, "#!/bin/sh\necho test 1.0.0\n", "utf8");
      await chmod(target, 0o755);
    }
    process.env.PATH = bin;
    const options: GlobalOptions = { home, root, preset: "recommended", dryRun: true, json: false, yes: true, skipExternal: true };
    const plan = await buildInstallPlan(options);
    assert.ok(plan.items.some((item) => item.kind === "command" && item.id === "codex-context7"));
    assert.ok(plan.items.some((item) => item.kind === "command" && item.id === "claude-context7"));
    const opencode = plan.items.find((item) => item.kind === "write" && item.id === "opencode-config");
    assert.ok(opencode?.kind === "write");
    assert.match(opencode.content, /mcp\.context7\.com/);
  } finally {
    process.env.PATH = originalPath;
    await rm(home, { recursive: true, force: true });
  }
});

test("external skill installation verifies canonical digests and gates authenticated scanning", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "orditra-external-digest-"));
  const home = join(workspace, "home");
  const source = join(workspace, "source");
  const toolkit = join(workspace, "toolkit");
  const target = join(home, "release", "skills");
  const originalPath = process.env.PATH;
  const originalSnykToken = process.env.SNYK_TOKEN;
  try {
    const locator = process.platform === "win32" ? "where" : "which";
    const git = execFileSync(locator, ["git"], { encoding: "utf8" }).trim().split(/\r?\n/)[0];
    assert.ok(git);
    const bin = join(workspace, "bin");
    await mkdir(bin, { recursive: true });
    await symlink(git, join(bin, basename(git)));
    const agentScan = join(bin, "snyk-agent-scan");
    await writeFile(agentScan, "#!/bin/sh\nexit 9\n", "utf8");
    await chmod(agentScan, 0o755);
    process.env.PATH = bin;

    await mkdir(join(source, "skills", "ask", "agents"), { recursive: true });
    await writeFile(join(source, "LICENSE"), "MIT\n", "utf8");
    await writeFile(join(source, "skills", "ask", "SKILL.md"), "skill\n", "utf8");
    await writeFile(join(source, "skills", "ask", "agents", "reviewer.md"), "reviewer\n", "utf8");
    execFileSync("git", ["-C", source, "init", "--quiet"]);
    execFileSync("git", ["-C", source, "config", "user.name", "Orditra Test"]);
    execFileSync("git", ["-C", source, "config", "user.email", "test@orditra.invalid"]);
    execFileSync("git", ["-C", source, "add", "."]);
    execFileSync("git", ["-C", source, "commit", "--quiet", "-m", "fixture"]);
    const commit = execFileSync("git", ["-C", source, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();

    await mkdir(join(toolkit, "registry"), { recursive: true });
    await writeFile(join(toolkit, "package.json"), `${JSON.stringify({ version: "0.2.0" })}\n`, "utf8");
    await writeFile(join(toolkit, "registry", "skill-sources.lock.yaml"), [
      "schemaVersion: 1",
      "sources:",
      "  fixture:",
      `    repository: ${JSON.stringify(source)}`,
      `    commit: ${commit}`,
      "    version: 1.0.0",
      "    license: MIT",
      "    licensePath: LICENSE",
      "    licenseDigest: adc37366f403835c1470ab2df93d3837d4719372fc1ef8593d922e06f033f8b2",
      "    reviewedAt: 2026-08-13",
      "    risk: low",
      "    permissions:",
      "      network: false",
      "      hooks: false",
      "      writesOutsideProject: false",
      "    contentDigests:",
      "      skills/ask: e891cdec364074bee6d395450d4a21305ed0be6dc08764ae206b175ea4eef2b7",
      "    sets:",
      "      fixture:",
      "        - skills/ask",
      "",
    ].join("\n"), "utf8");

    const preset = await loadPreset(root, "minimal");
    const plan: InstallPlan = {
      preset,
      clients: { codex: false, claude: false, opencode: false },
      capabilities: preset.capabilities,
      releaseDir: join(home, "release"),
      items: [{
        kind: "external-skills",
        id: "external-fixture",
        description: "Install fixture external skill",
        target,
        sourceName: "fixture",
        skillSet: "fixture",
      }],
    };
    const options: GlobalOptions = { home, root: toolkit, dryRun: false, json: false, yes: true, skipExternal: false };
    await applyPlan(plan, options);
    assert.equal(await readFile(join(target, "ask", "SKILL.md"), "utf8"), "skill\n");
    assert.equal(await readFile(join(target, "ask", "agents", "reviewer.md"), "utf8"), "reviewer\n");

    delete process.env.SNYK_TOKEN;
    const scanPlan: InstallPlan = {
      ...plan,
      capabilities: {
        ...plan.capabilities,
        "agent-supply-chain": { mode: "auto", provider: "agent-scan" },
      },
    };
    await assert.rejects(applyPlan(scanPlan, options), /SNYK_TOKEN is not configured/);
    process.env.SNYK_TOKEN = "test-token";
    await assert.rejects(applyPlan(scanPlan, options), /Command failed/);
  } finally {
    process.env.PATH = originalPath;
    if (originalSnykToken === undefined) delete process.env.SNYK_TOKEN;
    else process.env.SNYK_TOKEN = originalSnykToken;
    await rm(workspace, { recursive: true, force: true });
  }
});
