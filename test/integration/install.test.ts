import assert from "node:assert/strict";
import { chmod, lstat, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { applyPlan, rollbackLatest } from "../../src/executor.js";
import { buildInstallPlan } from "../../src/planner.js";
import type { GlobalOptions } from "../../src/types.js";

const root = process.cwd();

test("minimal install is reversible and idempotent", async () => {
  const home = await mkdtemp(join(tmpdir(), "agentflow-home-"));
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
    assert.match(await readFile(join(home, ".codex", "AGENTS.md"), "utf8"), /agentflow-kit:start/);
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

