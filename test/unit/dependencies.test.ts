import assert from "node:assert/strict";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { planDependencies, selectDependencyInstaller } from "../../src/dependencies.js";
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
