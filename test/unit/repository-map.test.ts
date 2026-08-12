import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { buildRepositoryMap } from "../../src/repository-map.js";

test("repository map respects code filters, skipped directories, and a hard token budget", async () => {
  const root = await mkdtemp(join(tmpdir(), "orditra-map-"));
  try {
    await mkdir(join(root, "nested"), { recursive: true });
    await mkdir(join(root, "node_modules"), { recursive: true });
    await writeFile(join(root, "large.ts"), "x".repeat(40), "utf8");
    await writeFile(join(root, "nested", "small.JS"), "1234", "utf8");
    await writeFile(join(root, "notes.md"), "ignored", "utf8");
    await writeFile(join(root, "node_modules", "ignored.ts"), "ignored", "utf8");

    const constrained = await buildRepositoryMap(root, 1);
    assert.equal(constrained.totalFiles, 2);
    assert.deepEqual(constrained.files.map((file) => file.path), ["large.ts"]);
    assert.equal(constrained.findings.find((finding) => finding.id === "repository-budget")?.status, "warning");

    const roomy = await buildRepositoryMap(root, 20);
    assert.deepEqual(roomy.files.map((file) => file.path), ["large.ts", "nested/small.JS"]);
    assert.equal(roomy.findings.find((finding) => finding.id === "repository-budget")?.status, "pass");

    const missing = await buildRepositoryMap(join(root, "missing"), 20);
    assert.equal(missing.totalFiles, 0);
    assert.deepEqual(missing.files, []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
