import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { loadUserConfig } from "../../src/user-config.js";

test("user configuration layers local values over versioned preferences", async () => {
  const home = await mkdtemp(join(tmpdir(), "agentflow-config-"));
  const directory = join(home, ".config", "agentflow-kit");
  try {
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, "config.yaml"), "schemaVersion: 1\npreset: full\nclients: [codex, opencode]\ncomponents:\n  serena: true\n  astGrep: true\n", "utf8");
    await writeFile(join(directory, "config.local.yaml"), "schemaVersion: 1\ncomponents:\n  serena: false\n", "utf8");
    const config = await loadUserConfig(home);
    assert.equal(config.preset, "full");
    assert.deepEqual(config.clients, ["codex", "opencode"]);
    assert.deepEqual(config.components, { serena: false, astGrep: true });
  } finally { await rm(home, { recursive: true, force: true }); }
});

test("user configuration rejects unknown clients", async () => {
  const home = await mkdtemp(join(tmpdir(), "agentflow-config-"));
  const directory = join(home, ".config", "agentflow-kit");
  try {
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, "config.yaml"), "schemaVersion: 1\nclients: [unknown]\n", "utf8");
    await assert.rejects(loadUserConfig(home), /clients must be auto/);
  } finally { await rm(home, { recursive: true, force: true }); }
});
