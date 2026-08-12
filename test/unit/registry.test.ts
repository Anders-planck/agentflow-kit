import assert from "node:assert/strict";
import test from "node:test";

import { loadCapabilityRegistry, loadDependencyRegistry, loadProfiles, loadProviderRegistry } from "../../src/registry.js";

test("capability, provider, and profile registries compose", async () => {
  const root = process.cwd();
  const [capabilities, providers, profiles, dependencies] = await Promise.all([loadCapabilityRegistry(root), loadProviderRegistry(root), loadProfiles(root), loadDependencyRegistry(root)]);
  assert.equal(capabilities.capabilities["semantic-code"]?.defaultProvider, "serena");
  assert.equal(providers.providers.context7?.transport, "http");
  assert.equal(profiles.web?.capabilities["browser-qa"]?.provider, "playwright-cli");
  assert.ok(dependencies.dependencies.uv?.requiredBy.includes("semantic-code"));
});
