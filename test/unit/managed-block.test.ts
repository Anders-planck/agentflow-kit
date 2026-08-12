import assert from "node:assert/strict";
import test from "node:test";

import { removeMarkdownBlock, upsertMarkdownBlock } from "../../src/managed-block.js";

test("managed Markdown blocks are idempotent and preserve surrounding content", () => {
  const original = "# Existing\n\nKeep me.\n";
  const once = upsertMarkdownBlock(original, "# Managed\n\nRule.");
  const twice = upsertMarkdownBlock(once, "# Managed\n\nRule.");
  assert.equal(twice, once);
  assert.match(once, /Keep me/);
  assert.match(once, /orditra:start/);
  assert.equal(removeMarkdownBlock(once), original);
});

test("managed Markdown blocks can be updated in place", () => {
  const first = upsertMarkdownBlock("", "one");
  const second = upsertMarkdownBlock(first, "two");
  assert.doesNotMatch(second, /\none\n/);
  assert.match(second, /\ntwo\n/);
});

test("legacy provisional markers migrate without duplicate policy blocks", () => {
  const legacy = "# Existing\n\n<!-- agentflow-kit:start -->\nold\n<!-- agentflow-kit:end -->\n";
  const migrated = upsertMarkdownBlock(legacy, "new");
  assert.doesNotMatch(migrated, /agentflow-kit:start/);
  assert.match(migrated, /orditra:start/);
  assert.equal((migrated.match(/orditra:start/g) ?? []).length, 1);
  assert.match(migrated, /\nnew\n/);
});
