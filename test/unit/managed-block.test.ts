import assert from "node:assert/strict";
import test from "node:test";

import { removeMarkdownBlock, upsertMarkdownBlock } from "../../src/managed-block.js";

test("managed Markdown blocks are idempotent and preserve surrounding content", () => {
  const original = "# Existing\n\nKeep me.\n";
  const once = upsertMarkdownBlock(original, "# Managed\n\nRule.");
  const twice = upsertMarkdownBlock(once, "# Managed\n\nRule.");
  assert.equal(twice, once);
  assert.match(once, /Keep me/);
  assert.match(once, /agentflow-kit:start/);
  assert.equal(removeMarkdownBlock(once), original);
});

test("managed Markdown blocks can be updated in place", () => {
  const first = upsertMarkdownBlock("", "one");
  const second = upsertMarkdownBlock(first, "two");
  assert.doesNotMatch(second, /\none\n/);
  assert.match(second, /\ntwo\n/);
});

