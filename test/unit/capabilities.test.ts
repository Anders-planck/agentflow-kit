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

test("recommended keeps authenticated Agent Scan opt-in", async () => {
  const preset = await loadPreset(root, "recommended");
  const resolved = await resolveCapabilities(root, preset, { schemaVersion: 2 });
  assert.equal(resolved.selections["agent-supply-chain"]?.mode, "registered");
  assert.equal(resolved.providers["agent-scan"]?.authenticated, true);
  assert.equal(resolved.providers["agent-scan"]?.risk, "high");
});

test("full preset activates every registered capability", async () => {
  const preset = await loadPreset(root, "full");
  const resolved = await resolveCapabilities(root, preset, { schemaVersion: 2 });
  const inactive = Object.entries(resolved.selections)
    .filter(([, selection]) => selection.mode !== "always" && selection.mode !== "auto")
    .map(([name]) => name);
  assert.deepEqual(inactive, []);
});
