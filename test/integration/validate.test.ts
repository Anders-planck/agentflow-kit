import assert from "node:assert/strict";
import { basename, join } from "node:path";
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import test from "node:test";
import { parse, stringify } from "yaml";

import { validateRepository } from "../../src/validate.js";

test("repository has no validation errors", async () => {
  const issues = await validateRepository(process.cwd());
  assert.deepEqual(issues.filter((issue) => issue.level === "error"), []);
});

test("repository validator reports independent portability and supply-chain violations", async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "orditra-validation-"));
  const fixture = join(temporaryRoot, "orditra");
  const excluded = new Set([".git", "coverage", "dist", "local-state", "node_modules"]);
  try {
    await cp(process.cwd(), fixture, {
      recursive: true,
      filter: (source) => !excluded.has(basename(source)),
    });

    await symlink(temporaryRoot, join(fixture, "escaping-link"));
    await writeFile(join(fixture, "broken.yaml"), "value: [unterminated\n", "utf8");
    await writeFile(
      join(fixture, "leak.md"),
      [
        "/" + "Users/" + "example/private-project",
        "AKIA" + "A".repeat(16),
        "ghp_" + "b".repeat(32),
        "sk-" + "c".repeat(32),
        "-----BEGIN " + "PRIVATE KEY-----",
      ].join("\n"),
      "utf8",
    );

    const invalidSkill = join(fixture, "skills", "invalid-contract");
    await mkdir(invalidSkill, { recursive: true });
    await writeFile(join(invalidSkill, "SKILL.md"), Array.from({ length: 101 }, (_, index) => `line ${index}`).join("\n"), "utf8");
    const duplicateSkill = join(fixture, "skills", "duplicate-workflow-router");
    await mkdir(duplicateSkill, { recursive: true });
    await writeFile(join(duplicateSkill, "SKILL.md"), [
      "---",
      "name: workflow-router",
      "description: Use when validating duplicate bundled skill names.",
      "---",
      "",
      "# Duplicate",
    ].join("\n"), "utf8");

    const pluginPath = join(fixture, ".codex-plugin", "plugin.json");
    const plugin = JSON.parse(await readFile(pluginPath, "utf8")) as Record<string, unknown>;
    Object.assign(plugin, { name: "wrong", version: "0.0.0", skills: "./wrong/", mcpServers: "./wrong.json" });
    await writeFile(pluginPath, `${JSON.stringify(plugin, null, 2)}\n`, "utf8");

    const sourcesPath = join(fixture, "registry", "skill-sources.lock.yaml");
    const sourceRegistry = parse(await readFile(sourcesPath, "utf8")) as {
      sources: Record<string, {
        commit: string;
        license: string;
        licenseDigest: string;
        reviewedAt: string;
        sets: Record<string, string[]>;
      }>;
    };
    const source = sourceRegistry.sources.mattpocock;
    assert.ok(source);
    source.commit = "main";
    source.license = "";
    source.licenseDigest = "missing";
    source.reviewedAt = "recently";
    source.sets.unsafe = ["../outside"];
    await writeFile(sourcesPath, stringify(sourceRegistry), "utf8");

    const workflowsPath = join(fixture, "registry", "workflows.yaml");
    const workflows = parse(await readFile(workflowsPath, "utf8")) as {
      stages: Record<string, { description: string; routes: Array<{ skill?: string; source?: string }> }>;
    };
    workflows.stages.empty = { description: "No routes", routes: [] };
    workflows.stages.invalid = { description: "Unknown route", routes: [{ skill: "missing-skill", source: "orditra" }] };
    await writeFile(workflowsPath, stringify(workflows), "utf8");

    const presetPath = join(fixture, "presets", "minimal.yaml");
    const preset = parse(await readFile(presetPath, "utf8")) as Record<string, unknown>;
    preset.externalSkillSets = ["missing-set"];
    await writeFile(presetPath, stringify(preset), "utf8");

    await writeFile(join(fixture, ".github", "workflows", "unpinned.yml"), [
      "name: unpinned",
      "jobs:",
      "  test:",
      "    runs-on: ubuntu-latest",
      "    steps:",
      "      - uses: ./local-action",
      "      - uses: docker://alpine:3",
      "      - uses: actions/checkout@v4",
    ].join("\n"), "utf8");

    const issues = await validateRepository(fixture);
    const messages = issues.map((issue) => issue.message);
    for (const expected of [
      "Repository symlink escapes the repository root",
      "Invalid YAML:",
      "Missing YAML frontmatter",
      "Invalid skill name",
      "Description must explain",
      "SKILL.md exceeds",
      "Duplicate bundled skill name",
      "Personal macOS home path found",
      "AWS access key pattern found",
      "GitHub token pattern found",
      "API secret pattern found",
      "private key pattern found",
      "Plugin name must match",
      "Plugin version must match",
      "Plugin must use the canonical skills directory",
      "Plugin must use the canonical MCP manifest",
      "must pin a full commit hash",
      "has no license metadata",
      "must pin the license digest",
      "must record a review date",
      "Unsafe external skill path",
      "Missing content digest",
      "has no routes",
      "Unknown skill route",
      "Unknown external skill set",
      "GitHub Action must use a full commit SHA",
    ]) assert.ok(messages.some((message) => message.includes(expected)), `missing validation issue: ${expected}`);

    await writeFile(pluginPath, "{invalid", "utf8");
    await writeFile(join(fixture, ".agents", "plugins", "marketplace.json"), "{invalid", "utf8");
    const malformedMessages = (await validateRepository(fixture)).map((issue) => issue.message);
    assert.ok(malformedMessages.some((message) => message.startsWith("Invalid plugin manifest:")));
    assert.ok(malformedMessages.some((message) => message.startsWith("Invalid marketplace:")));
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});
