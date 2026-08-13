import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { detectedClients, runDoctor } from "../../src/doctor.js";

test("doctor surfaces an interrupted transaction as recovery-required", async () => {
  const home = await mkdtemp(join(tmpdir(), "orditra-doctor-"));
  const originalPath = process.env.PATH;
  try {
    process.env.PATH = "";
    const state = join(home, ".local", "state", "orditra");
    await mkdir(state, { recursive: true });
    await writeFile(join(state, "transaction.json"), JSON.stringify({ status: "recovery-required" }), "utf8");
    const checks = await runDoctor(home, process.cwd());
    assert.equal(checks.find((check) => check.id === "transaction-recovery")?.status, "error");
  } finally {
    process.env.PATH = originalPath;
    await rm(home, { recursive: true, force: true });
  }
});

test("doctor verifies configured clients and detects divergent skill copies", async () => {
  const home = await mkdtemp(join(tmpdir(), "orditra-doctor-clients-"));
  const originalPath = process.env.PATH;
  const originalPortableHome = process.env.ORDITRA_PORTABLE_HOME;
  const portableHome = join(home, "portable");
  try {
    const bin = join(home, "bin");
    await mkdir(bin, { recursive: true });
    for (const name of ["codex", "claude", "opencode", "serena", "sg", "uvx", "node"]) {
      const executable = join(bin, name);
      await writeFile(executable, `#!/bin/sh\necho ${name} 1.0.0\n`, "utf8");
      await chmod(executable, 0o755);
    }
    process.env.PATH = bin;
    process.env.ORDITRA_PORTABLE_HOME = portableHome;

    const state = join(portableHome, "state", "orditra");
    await mkdir(state, { recursive: true });
    await writeFile(join(state, "transaction.json"), JSON.stringify({ status: "applying", currentItem: "codex-context-mode" }), "utf8");

    const missingConfigChecks = await runDoctor(home, process.cwd());
    assert.equal(missingConfigChecks.find((check) => check.id === "transaction-recovery")?.status, "warning");
    assert.deepEqual(detectedClients(missingConfigChecks), ["codex", "claude", "opencode"]);
    for (const id of [
      "codex-context-mode", "codex-serena", "codex-context7",
      "claude-context-mode", "claude-serena", "claude-context7",
      "opencode-context-mode", "opencode-serena", "opencode-context7",
    ]) assert.equal(missingConfigChecks.find((check) => check.id === id)?.status, "warning", id);

    await mkdir(join(home, ".codex"), { recursive: true });
    await writeFile(join(home, ".codex", "config.toml"), [
      '[plugins."context-mode@context-mode"]',
      "[mcp_servers.serena]",
      "[mcp_servers.context7]",
    ].join("\n"), "utf8");
    await mkdir(join(home, ".claude"), { recursive: true });
    await writeFile(join(home, ".claude", "settings.json"), JSON.stringify({ enabledPlugins: { "context-mode@context-mode": true } }), "utf8");
    await writeFile(join(home, ".claude.json"), JSON.stringify({ mcp: { serena: {}, context7: {} } }), "utf8");
    await mkdir(join(portableHome, "config", "opencode"), { recursive: true });
    await writeFile(join(portableHome, "config", "opencode", "opencode.json"), JSON.stringify({
      plugin: ["context-mode"],
      mcp: { serena: {}, context7: {} },
    }), "utf8");

    const sharedTarget = join(home, "shared-skill");
    await mkdir(sharedTarget, { recursive: true });
    await writeFile(join(sharedTarget, "SKILL.md"), "shared", "utf8");
    for (const root of [join(home, ".agents", "skills"), join(home, ".claude", "skills")]) {
      await mkdir(join(root, "same", "nested"), { recursive: true });
      await writeFile(join(root, "same", "SKILL.md"), "same", "utf8");
      await writeFile(join(root, "same", "nested", "reference.md"), "same", "utf8");
      await mkdir(join(root, "divergent"), { recursive: true });
      await symlink(sharedTarget, join(root, "shared"));
    }
    await writeFile(join(home, ".agents", "skills", "divergent", "SKILL.md"), "agents", "utf8");
    await writeFile(join(home, ".claude", "skills", "divergent", "SKILL.md"), "claude", "utf8");

    const configuredChecks = await runDoctor(home, process.cwd());
    for (const id of [
      "codex-context-mode", "codex-serena", "codex-context7",
      "claude-context-mode", "claude-serena", "claude-context7",
      "opencode-context-mode", "opencode-serena", "opencode-context7",
    ]) assert.equal(configuredChecks.find((check) => check.id === id)?.status, "pass", id);
    assert.equal(configuredChecks.find((check) => check.id === "skill-divergence")?.status, "warning");
    assert.match(configuredChecks.find((check) => check.id === "skill-divergence")?.summary ?? "", /divergent/);

    await writeFile(join(home, ".codex", "config.toml"), [
      '[plugins."context-mode@context-mode"]',
      "[mcp_servers.serena]",
      "[mcp_servers.context7]",
      "[mcp_servers.probe]",
      "[mcp_servers.chrome-devtools]",
      "[mcp_servers.github]",
    ].join("\n"), "utf8");
    await writeFile(join(home, ".claude.json"), JSON.stringify({
      mcp: { serena: {}, context7: {}, probe: {}, "chrome-devtools": {}, github: {} },
    }), "utf8");
    await writeFile(join(portableHome, "config", "opencode", "opencode.json"), JSON.stringify({
      plugin: ["context-mode"],
      mcp: { serena: {}, context7: {}, probe: {}, "chrome-devtools": {}, github: {} },
    }), "utf8");
    const fullChecks = await runDoctor(home, process.cwd(), "full");
    for (const id of [
      "codex-probe", "codex-chrome-devtools", "codex-github",
      "claude-probe", "claude-chrome-devtools", "claude-github",
      "opencode-probe", "opencode-chrome-devtools", "opencode-github",
    ]) assert.equal(fullChecks.find((check) => check.id === id)?.status, "pass", id);
  } finally {
    process.env.PATH = originalPath;
    if (originalPortableHome === undefined) delete process.env.ORDITRA_PORTABLE_HOME;
    else process.env.ORDITRA_PORTABLE_HOME = originalPortableHome;
    await rm(home, { recursive: true, force: true });
  }
});

test("doctor reports missing credentials for explicitly enabled Agent Scan", async () => {
  const home = await mkdtemp(join(tmpdir(), "orditra-doctor-agent-scan-"));
  const originalPath = process.env.PATH;
  const originalPortableHome = process.env.ORDITRA_PORTABLE_HOME;
  const originalSnykToken = process.env.SNYK_TOKEN;
  const portableHome = join(home, "portable");
  try {
    const bin = join(home, "bin");
    await mkdir(bin, { recursive: true });
    const executable = join(bin, "snyk-agent-scan");
    await writeFile(executable, "#!/bin/sh\necho snyk-agent-scan 0.5.17\n", "utf8");
    await chmod(executable, 0o755);
    process.env.PATH = bin;
    process.env.ORDITRA_PORTABLE_HOME = portableHome;
    delete process.env.SNYK_TOKEN;
    const configDir = join(portableHome, "config", "orditra");
    await mkdir(configDir, { recursive: true });
    await writeFile(join(configDir, "config.yaml"), [
      "schemaVersion: 2",
      "preset: recommended",
      "capabilities:",
      "  agent-supply-chain: { mode: auto, provider: agent-scan }",
      "",
    ].join("\n"), "utf8");

    const checks = await runDoctor(home, process.cwd());
    const provider = checks.find((check) => check.id === "provider-agent-scan");
    assert.equal(provider?.status, "warning");
    assert.match(provider?.summary ?? "", /SNYK_TOKEN/);
  } finally {
    process.env.PATH = originalPath;
    if (originalPortableHome === undefined) delete process.env.ORDITRA_PORTABLE_HOME;
    else process.env.ORDITRA_PORTABLE_HOME = originalPortableHome;
    if (originalSnykToken === undefined) delete process.env.SNYK_TOKEN;
    else process.env.SNYK_TOKEN = originalSnykToken;
    await rm(home, { recursive: true, force: true });
  }
});
