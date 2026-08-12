import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { applyProjectInit, planProjectInit } from "../../src/project.js";

test("project init creates once and preserves thereafter", async () => {
  const root = await mkdtemp(join(tmpdir(), "orditra-project-"));
  try {
    const first = await planProjectInit(root);
    assert.equal(first.action, "create");
    await applyProjectInit(first);
    assert.match(await readFile(first.target, "utf8"), /schemaVersion: 2/);
    const second = await planProjectInit(root);
    assert.equal(second.action, "preserve");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("project init preserves a legacy pre-release project marker", async () => {
  const root = await mkdtemp(join(tmpdir(), "orditra-project-legacy-"));
  try {
    const legacy = join(root, ".agentflow", "project.yaml");
    await mkdir(join(root, ".agentflow"), { recursive: true });
    await writeFile(legacy, "schemaVersion: 1\n", "utf8");
    assert.deepEqual(await planProjectInit(root), { target: legacy, action: "preserve" });
  } finally { await rm(root, { recursive: true, force: true }); }
});
