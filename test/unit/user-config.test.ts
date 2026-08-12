import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { resolveAppPaths, resolveLegacyAppPaths } from "../../src/paths.js";
import { applyUserConfigMigration, loadUserConfig, planUserConfigMigration } from "../../src/user-config.js";

async function withIsolatedConfigHome(run: (home: string, directory: string) => Promise<void>): Promise<void> {
  const home = await mkdtemp(join(tmpdir(), "orditra-config-"));
  const originalPortableHome = process.env.ORDITRA_PORTABLE_HOME;
  process.env.ORDITRA_PORTABLE_HOME = join(home, ".orditra-portable");
  try {
    await run(home, resolveAppPaths(home).appConfigDir);
  } finally {
    if (originalPortableHome === undefined) delete process.env.ORDITRA_PORTABLE_HOME;
    else process.env.ORDITRA_PORTABLE_HOME = originalPortableHome;
    await rm(home, { recursive: true, force: true });
  }
}

test("user configuration layers local values over versioned preferences", async () => {
  await withIsolatedConfigHome(async (home, directory) => {
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, "config.yaml"), "schemaVersion: 1\npreset: full\nclients: [codex, opencode]\ncomponents:\n  serena: true\n  astGrep: true\n", "utf8");
    await writeFile(join(directory, "config.local.yaml"), "schemaVersion: 1\ncomponents:\n  serena: false\n", "utf8");
    const config = await loadUserConfig(home);
    assert.equal(config.preset, "full");
    assert.deepEqual(config.clients, ["codex", "opencode"]);
    assert.deepEqual(config.components, { serena: false, astGrep: true });
  });
});

test("user configuration rejects unknown clients", async () => {
  await withIsolatedConfigHome(async (home, directory) => {
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, "config.yaml"), "schemaVersion: 1\nclients: [unknown]\n", "utf8");
    await assert.rejects(loadUserConfig(home), /clients must be auto/);
  });
});

test("legacy pre-release configuration is used until an Orditra config overrides it", async () => {
  await withIsolatedConfigHome(async (home, current) => {
    const legacy = resolveLegacyAppPaths(home).appConfigDir;
    await mkdir(legacy, { recursive: true });
    await writeFile(join(legacy, "config.yaml"), "schemaVersion: 1\npreset: full\ncomponents:\n  serena: false\n", "utf8");
    assert.deepEqual(await loadUserConfig(home), { schemaVersion: 1, preset: "full", components: { serena: false } });

    await mkdir(current, { recursive: true });
    await writeFile(join(current, "config.yaml"), "schemaVersion: 1\npreset: recommended\n", "utf8");
    assert.equal((await loadUserConfig(home)).preset, "recommended");
  });
});

test("schema-v1 user configuration migrates to capability schema v2", async () => {
  await withIsolatedConfigHome(async (home, directory) => {
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, "config.yaml"), "schemaVersion: 1\npreset: recommended\ncomponents:\n  serena: false\n", "utf8");
    const migration = await planUserConfigMigration(home);
    assert.equal(migration.action, "migrate");
    await applyUserConfigMigration(migration);
    const config = await loadUserConfig(home);
    assert.equal(config.schemaVersion, 2);
    assert.equal(config.capabilities?.["semantic-code"]?.mode, "off");
  });
});
