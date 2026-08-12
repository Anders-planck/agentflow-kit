import assert from "node:assert/strict";
import test from "node:test";

import { parseJsonc, removeJsoncValue, setJsoncValue } from "../../src/jsonc.js";

test("JSONC updates preserve comments and unrelated keys", () => {
  const original = `{
  // user setting
  "mcp": { "Neon": { "type": "remote" } }
}
`;
  const updated = setJsoncValue(original, ["plugin"], ["context-mode"]);
  assert.match(updated, /user setting/);
  const parsed = parseJsonc<Record<string, unknown>>(updated, "test");
  assert.deepEqual(parsed.plugin, ["context-mode"]);
  assert.ok(parsed.mcp);
});

test("JSONC values can be removed", () => {
  const updated = removeJsoncValue('{"mcp":{"serena":{"type":"local"},"Neon":{}}}', ["mcp", "serena"]);
  const parsed = parseJsonc<{ mcp: Record<string, unknown> }>(updated, "test");
  assert.equal(parsed.mcp.serena, undefined);
  assert.ok(parsed.mcp.Neon);
});

