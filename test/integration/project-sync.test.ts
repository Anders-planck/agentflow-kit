import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { applyProjectSync, planProjectSync } from "../../src/project.js";

test("project sync detects web TypeScript and materializes only relevant skills", async () => {
  const project = await mkdtemp(join(tmpdir(), "orditra-project-sync-"));
  try {
    await writeFile(join(project, "package.json"), JSON.stringify({ dependencies: { react: "1.0.0" }, devDependencies: { typescript: "1.0.0" } }), "utf8");
    await writeFile(join(project, "app.tsx"), "export const App = () => null;\n", "utf8");
    const plan = await planProjectSync(project, process.cwd());
    assert.ok(plan.detection.profiles.includes("web"));
    assert.ok(plan.detection.profiles.includes("architecture-js"));
    assert.equal(plan.detection.capabilities["browser-qa"]?.provider, "playwright-cli");
    assert.ok(plan.skills.some((skill) => skill.name === "browser-qa" && skill.action === "create"));
    await applyProjectSync(plan);
    assert.match(await readFile(join(project, ".orditra", "project.yaml"), "utf8"), /schemaVersion: 2/);
    assert.match(await readFile(join(project, ".agents", "skills", "browser-qa", "SKILL.md"), "utf8"), /name: browser-qa/);
    assert.equal((await planProjectSync(project, process.cwd())).skills.find((skill) => skill.name === "browser-qa")?.action, "unchanged");
  } finally { await rm(project, { recursive: true, force: true }); }
});

test("project sync includes an explicitly selected profile without detection signals", async () => {
  const project = await mkdtemp(join(tmpdir(), "orditra-project-explicit-"));
  try {
    const plan = await planProjectSync(project, process.cwd(), ["visual-export"]);
    assert.ok(plan.detection.profiles.includes("visual-export"));
    assert.equal(plan.detection.capabilities["visual-export"]?.provider, "d2");
    assert.ok(plan.skills.some((skill) => skill.name === "evidence-report"));
  } finally { await rm(project, { recursive: true, force: true }); }
});
