import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { applyProjectInit, planProjectInit } from "../../src/project.js";

test("project init creates once and preserves thereafter", async () => {
  const root = await mkdtemp(join(tmpdir(), "agentflow-project-"));
  try {
    const first = await planProjectInit(root);
    assert.equal(first.action, "create");
    await applyProjectInit(first);
    assert.match(await readFile(first.target, "utf8"), /schemaVersion: 1/);
    const second = await planProjectInit(root);
    assert.equal(second.action, "preserve");
  } finally { await rm(root, { recursive: true, force: true }); }
});

