import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { applyPlan } from "../../src/executor.js";
import { loadPreset } from "../../src/registry.js";
import type { GlobalOptions, InstallPlan } from "../../src/types.js";

test("executor restores prior files when a later action fails", async () => {
  const home = await mkdtemp(join(tmpdir(), "orditra-executor-"));
  const target = join(home, "target.txt");
  try {
    await writeFile(target, "before\n", "utf8");
    const preset = await loadPreset(process.cwd(), "minimal");
    const plan: InstallPlan = {
      preset,
      clients: { codex: false, claude: false, opencode: false },
      capabilities: preset.capabilities,
      releaseDir: join(home, "release"),
      items: [
        { kind: "write", id: "write", description: "write", target, content: "after\n" },
        { kind: "command", id: "fail", description: "fail", spec: { command: process.execPath, args: ["-e", "process.exit(9)"] } },
      ],
    };
    const options: GlobalOptions = { home, root: process.cwd(), dryRun: false, json: false, yes: true, skipExternal: false };
    await assert.rejects(applyPlan(plan, options), /Command failed/);
    assert.equal(await readFile(target, "utf8"), "before\n");
    await assert.rejects(readFile(join(home, ".local", "state", "orditra", "transaction.json"), "utf8"));
  } finally { await rm(home, { recursive: true, force: true }); }
});
