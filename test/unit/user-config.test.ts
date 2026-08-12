import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { applyUserConfigMigration, loadUserConfig, planUserConfigMigration } from "../../src/user-config.js";

test("user configuration layers local values over versioned preferences", async () => {
  const home = await mkdtemp(join(tmpdir(), "orditra-config-"));
  const directory = join(home, ".config", "orditra");
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
  const home = await mkdtemp(join(tmpdir(), "orditra-config-"));
  const directory = join(home, ".config", "orditra");
  try {
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, "config.yaml"), "schemaVersion: 1\nclients: [unknown]\n", "utf8");
    await assert.rejects(loadUserConfig(home), /clients must be auto/);
  } finally { await rm(home, { recursive: true, force: true }); }
});

test("legacy pre-release configuration is used until an Orditra config overrides it", async () => {
  const home = await mkdtemp(join(tmpdir(), "orditra-legacy-config-"));
  try {
    const legacy = join(home, ".config", "agentflow-kit");
    await mkdir(legacy, { recursive: true });
    await writeFile(join(legacy, "config.yaml"), "schemaVersion: 1\npreset: full\ncomponents:\n  serena: false\n", "utf8");
    assert.deepEqual(await loadUserConfig(home), { schemaVersion: 1, preset: "full", components: { serena: false } });

    const current = join(home, ".config", "orditra");
    await mkdir(current, { recursive: true });
    await writeFile(join(current, "config.yaml"), "schemaVersion: 1\npreset: recommended\n", "utf8");
    assert.equal((await loadUserConfig(home)).preset, "recommended");
  } finally { await rm(home, { recursive: true, force: true }); }
});

test("schema-v1 user configuration migrates to capability schema v2", async () => {
  const home = await mkdtemp(join(tmpdir(), "orditra-config-migration-"));
  const directory = join(home, ".config", "orditra");
  try {
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, "config.yaml"), "schemaVersion: 1\npreset: recommended\ncomponents:\n  serena: false\n", "utf8");
    const migration = await planUserConfigMigration(home);
    assert.equal(migration.action, "migrate");
    await applyUserConfigMigration(migration);
    const config = await loadUserConfig(home);
    assert.equal(config.schemaVersion, 2);
    assert.equal(config.capabilities?.["semantic-code"]?.mode, "off");
  } finally { await rm(home, { recursive: true, force: true }); }
});
