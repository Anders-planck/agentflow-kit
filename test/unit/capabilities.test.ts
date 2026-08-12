import assert from "node:assert/strict";
import test from "node:test";

import { resolveCapabilities } from "../../src/capabilities.js";
import { loadPreset } from "../../src/registry.js";

const root = process.cwd();

test("recommended preset resolves providers and keeps project capabilities out of global components", async () => {
  const preset = await loadPreset(root, "recommended");
  const resolved = await resolveCapabilities(root, preset, { schemaVersion: 2 });
  assert.equal(resolved.selections["current-docs"]?.provider, "context7");
  assert.equal(resolved.components.serena, true);
  assert.equal(resolved.components.contextMode, true);
  assert.equal(resolved.selections["browser-qa"]?.mode, "project");
});

test("schema-v1 component overrides migrate into capability decisions", async () => {
  const preset = await loadPreset(root, "recommended");
  const resolved = await resolveCapabilities(root, preset, { schemaVersion: 1, components: { serena: false, astGrep: false } });
  assert.equal(resolved.selections["semantic-code"]?.mode, "off");
  assert.equal(resolved.selections["structural-search"]?.mode, "off");
});

test("unknown profiles fail closed", async () => {
  const preset = await loadPreset(root, "minimal");
  await assert.rejects(resolveCapabilities(root, preset, { schemaVersion: 2, profiles: ["missing"] }), /Unknown capability profile/);
});
