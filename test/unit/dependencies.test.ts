import assert from "node:assert/strict";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { applyDependencies, planDependencies, selectDependencyInstaller } from "../../src/dependencies.js";
import { loadDependencyRegistry } from "../../src/registry.js";

test("minimal preset requires no external executables", async () => {
  const home = await mkdtemp(join(tmpdir(), "orditra-dependencies-minimal-"));
  try {
    const plan = await planDependencies({
      home,
      root: process.cwd(),
      preset: "minimal",
      dryRun: true,
      json: false,
      yes: false,
      skipExternal: false,
    }, { pathValue: "" });
    assert.deepEqual(plan.items, []);
  } finally { await rm(home, { recursive: true, force: true }); }
});

test("dependency installation reports item-level progress", async () => {
  const updates: string[] = [];
  await applyDependencies({ items: [{
    name: "example",
    description: "Example dependency",
    source: "https://example.test/dependency",
    requiredBy: ["workflow-core"],
    satisfiedBy: ["true"],
    status: "missing",
    spec: { command: "/usr/bin/true", args: [] },
  }] }, (completed, total, label) => updates.push(`${completed}/${total} ${label}`));
  assert.deepEqual(updates, ["0/1 Installing example", "1/1 Installed example"]);
});

test("full preset inventories every selected executable provider", async () => {
  const home = await mkdtemp(join(tmpdir(), "orditra-dependencies-full-"));
  try {
    const plan = await planDependencies({
      home,
      root: process.cwd(),
      preset: "full",
      dryRun: true,
      json: false,
      yes: false,
      skipExternal: false,
    }, { pathValue: "" });
    assert.deepEqual(plan.items.map((item) => item.name).sort(), [
      "agent-scan",
      "ast-grep",
      "chrome-devtools-mcp",
      "d2",
      "dependency-cruiser",
      "git",
      "go",
      "joern",
      "osv-scanner",
      "playwright-cli",
      "probe",
      "promptfoo",
      "qmd",
      "repomix",
      "scip",
      "semgrep",
      "toolhive",
      "trivy",
      "uv",
      "zizmor",
    ]);
  } finally { await rm(home, { recursive: true, force: true }); }
});

test("full dependency planning chains pinned tools behind an installable Go runtime", async () => {
  const home = await mkdtemp(join(tmpdir(), "orditra-dependencies-chain-home-"));
  const bin = await mkdtemp(join(tmpdir(), "orditra-dependencies-chain-bin-"));
  try {
    const brew = join(bin, "brew");
    await writeFile(brew, "#!/bin/sh\nexit 0\n", "utf8");
    await chmod(brew, 0o755);
    const plan = await planDependencies({
      home,
      root: process.cwd(),
      preset: "full",
      dryRun: true,
      json: false,
      yes: false,
      skipExternal: false,
    }, { platform: "darwin", pathValue: bin });
    const byName = new Map(plan.items.map((item) => [item.name, item]));
    assert.equal(byName.get("go")?.spec?.command, brew);
    assert.equal(byName.get("toolhive")?.spec?.command, "go");
    assert.equal(byName.get("d2")?.spec?.command, "go");
  } finally {
    await rm(home, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});

test("dependency installers select only an available package manager", async () => {
  const bin = await mkdtemp(join(tmpdir(), "orditra-dependencies-bin-"));
  try {
    const npm = join(bin, "npm");
    await writeFile(npm, "#!/bin/sh\nexit 0\n", "utf8");
    await chmod(npm, 0o755);
    const registry = await loadDependencyRegistry(process.cwd());
    const installer = selectDependencyInstaller(registry.dependencies["ast-grep"]!, { platform: "darwin", pathValue: bin });
    assert.equal(installer?.command, npm);
    assert.deepEqual(installer?.args, ["install", "--global", "@ast-grep/cli@0.43.0"]);
  } finally { await rm(bin, { recursive: true, force: true }); }
});
