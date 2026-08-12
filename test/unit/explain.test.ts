import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { explainConfiguration, explainSkill } from "../../src/explain.js";

test("skill explanation distinguishes bundled, installed, external, and unknown skills", async () => {
  const home = await mkdtemp(join(tmpdir(), "orditra-explain-"));
  const root = process.cwd();
  try {
    const bundled = await explainSkill("workflow-router", home, root);
    assert.equal(bundled.source, "bundled");
    assert.match(bundled.description ?? "", /Use (for|when)/i);
    assert.deepEqual(bundled.activeScopes, []);

    const installedContent = [
      "---",
      "name: local-only",
      "description: Use when explaining a locally installed skill.",
      "---",
      "",
      "# Local only",
    ].join("\n");
    for (const scope of [".agents", ".claude"]) {
      const directory = join(home, scope, "skills", "local-only");
      await mkdir(directory, { recursive: true });
      await writeFile(join(directory, "SKILL.md"), installedContent, "utf8");
    }
    const installed = await explainSkill("local-only", home, root);
    assert.equal(installed.source, "installed");
    assert.equal(installed.description, "Use when explaining a locally installed skill.");
    assert.deepEqual(installed.activeScopes.sort(), ["agents-user", "claude-user"]);

    const plainDirectory = join(home, ".agents", "skills", "plain-local");
    await mkdir(plainDirectory, { recursive: true });
    await writeFile(join(plainDirectory, "SKILL.md"), "# No frontmatter\n", "utf8");
    const plain = await explainSkill("plain-local", home, root);
    assert.equal(plain.source, "installed");
    assert.equal(plain.description, undefined);

    const external = await explainSkill("ask-matt", home, root);
    assert.equal(external.source, "external-lock");
    assert.match(external.provenance ?? "", /^mattpocock@[a-f0-9]{40}:/);

    await assert.rejects(explainSkill("definitely-unknown-skill", home, root), /Unknown skill/);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("configuration explanation highlights inactive and authenticated high-risk capabilities", async () => {
  const home = await mkdtemp(join(tmpdir(), "orditra-explain-config-"));
  const originalPortableHome = process.env.ORDITRA_PORTABLE_HOME;
  const portableHome = join(home, "portable");
  try {
    process.env.ORDITRA_PORTABLE_HOME = portableHome;
    const configDirectory = join(portableHome, "config", "orditra");
    await mkdir(configDirectory, { recursive: true });
    await writeFile(join(configDirectory, "config.yaml"), [
      "schemaVersion: 2",
      "preset: full",
      "capabilities:",
      "  github-integration:",
      "    mode: always",
    ].join("\n"), "utf8");

    const full = await explainConfiguration(home, process.cwd());
    const github = full.find((finding) => finding.id === "github-integration");
    assert.equal(github?.status, "warning");
    assert.match(github?.remediation ?? "", /explicit authentication/);
    assert.ok(full.some((finding) => finding.status === "info"));
    assert.ok(full.some((finding) => finding.status === "pass"));

    const minimal = await explainConfiguration(home, process.cwd(), "minimal");
    assert.ok(minimal.some((finding) => finding.id === "workflow-core" && finding.status === "pass"));
  } finally {
    if (originalPortableHome === undefined) delete process.env.ORDITRA_PORTABLE_HOME;
    else process.env.ORDITRA_PORTABLE_HOME = originalPortableHome;
    await rm(home, { recursive: true, force: true });
  }
});
