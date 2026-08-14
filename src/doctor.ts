import { createHash } from "node:crypto";
import { lstat, readFile, readdir, readlink } from "node:fs/promises";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { capabilityIsActive, resolveCapabilities } from "./capabilities.js";
import { findExecutable, formatCommand } from "./commands.js";
import { planDependencies } from "./dependencies.js";
import { parseJsonc } from "./jsonc.js";
import { findProjectRoot, resolveAppPaths } from "./paths.js";
import { containsKeyDeep } from "./planning/shared.js";
import { loadPreset } from "./registry.js";
import type { ClientName, Finding } from "./types.js";
import { loadUserConfig } from "./user-config.js";

export type DoctorCheck = Finding;

async function readOptional(path: string): Promise<string> {
  try { return await readFile(path, "utf8"); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "";
    throw error;
  }
}

function versionOf(executable: string): string {
  const result = spawnSync(executable, ["--version"], { encoding: "utf8", timeout: 5000 });
  return `${result.stdout || result.stderr || "unknown"}`.trim().split("\n")[0] ?? "unknown";
}

async function hashDirectory(path: string): Promise<string | null> {
  try {
    const hash = createHash("sha256");
    async function visit(directory: string, prefix = ""): Promise<void> {
      const entries = (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name));
      for (const entry of entries) {
        const relative = join(prefix, entry.name);
        const absolute = join(directory, entry.name);
        if (entry.isDirectory()) await visit(absolute, relative);
        else if (entry.isFile()) {
          hash.update(relative);
          hash.update(await readFile(absolute));
        }
      }
    }
    await visit(path);
    return hash.digest("hex");
  } catch { return null; }
}

function finding(id: string, capability: string, status: Finding["status"], summary: string, remediation?: string): Finding {
  return { id, capability, status, summary, ...(remediation ? { remediation } : {}) };
}

export async function runDoctor(home: string, root = findProjectRoot(), presetOverride?: string): Promise<Finding[]> {
  const started = Date.now();
  const appPaths = resolveAppPaths(home);
  const checks: Finding[] = [];
  const userConfig = await loadUserConfig(home, root);
  const preset = await loadPreset(root, presetOverride ?? userConfig.preset ?? "recommended");
  const resolved = await resolveCapabilities(root, preset, userConfig);
  const transactionText = await readOptional(join(appPaths.appStateDir, "transaction.json"));
  if (transactionText) {
    const transaction = JSON.parse(transactionText) as { status?: string; currentItem?: string };
    checks.push(finding(
      "transaction-recovery",
      "installer",
      transaction.status === "recovery-required" ? "error" : "warning",
      `Incomplete installer transaction: ${transaction.status ?? "unknown"}${transaction.currentItem ? ` at ${transaction.currentItem}` : ""}`,
      "Inspect the transaction journal and run rollback before another install.",
    ));
  } else {
    checks.push(finding("transaction-recovery", "installer", "pass", "No incomplete installer transaction"));
  }

  const binaries: Array<[string, string, string]> = [
    ["codex", "Codex", "client"], ["claude", "Claude Code", "client"], ["opencode", "OpenCode", "client"],
    ["serena", "Serena", "semantic-code"], ["sg", "ast-grep", "structural-search"], ["uvx", "uvx", "semantic-code"], ["node", "Node.js", "runtime"],
  ];
  const found = new Map<string, string>();
  for (const [binary, label, capability] of binaries) {
    const executable = findExecutable(binary);
    if (executable) {
      found.set(binary, executable);
      checks.push(finding(`binary-${binary}`, capability, "pass", `${label}: ${versionOf(executable)}`));
    }
  }

  const dependencies = await planDependencies({
    home,
    root,
    ...(presetOverride ? { preset: presetOverride } : {}),
    dryRun: true,
    json: false,
    yes: false,
    skipExternal: false,
  });
  for (const dependency of dependencies.items) {
    checks.push(finding(
      `dependency-${dependency.name}`,
      dependency.requiredBy.join(","),
      dependency.status === "satisfied" ? "pass" : dependency.status === "missing" ? "warning" : "error",
      dependency.status === "satisfied" ? `${dependency.name} dependency is available` : `${dependency.name} dependency is required but unavailable`,
      dependency.spec ? `Run ${formatCommand(dependency.spec)} or rerun orditra install and approve dependency installation.` : dependency.remediation ?? "Install it manually or disable the requiring capability.",
    ));
  }

  for (const [capability, selection] of Object.entries(resolved.selections)) {
    if (!capabilityIsActive(selection) || !selection.provider) continue;
    const provider = resolved.providers[selection.provider];
    if (!provider?.executable || provider.kind === "mcp" && selection.provider === "serena") continue;
    const aliases = selection.provider === "ast-grep"
      ? ["sg", "ast-grep"]
      : [provider.executable];
    const executable = aliases.map((name) => findExecutable(name)).find(Boolean);
    const credentialsReady = selection.provider !== "agent-scan" || Boolean(process.env.SNYK_TOKEN);
    const ready = Boolean(executable && credentialsReady);
    const summary = !executable
      ? `${selection.provider} is active but unavailable on PATH`
      : !credentialsReady
        ? `${selection.provider} is active but SNYK_TOKEN is not configured`
        : `${selection.provider} available: ${versionOf(executable)}`;
    const remediation = !executable
      ? `Install the pinned provider or set ${capability}.mode to registered/off.`
      : !credentialsReady
        ? `Set SNYK_TOKEN or set ${capability}.mode to registered/off.`
        : undefined;
    checks.push(finding(
      `provider-${selection.provider}`,
      capability,
      ready ? "pass" : "warning",
      summary,
      remediation,
    ));
  }

  const codexConfig = await readOptional(join(appPaths.home, ".codex", "config.toml"));
  if (found.has("codex")) {
    checks.push(finding("codex-context-mode", "context-protection", /plugins\."context-mode@context-mode"/.test(codexConfig) ? "pass" : "warning", /plugins\."context-mode@context-mode"/.test(codexConfig) ? "Codex context-mode plugin configured" : "Codex context-mode plugin missing"));
    checks.push(finding("codex-serena", "semantic-code", /\[mcp_servers\.serena\]/i.test(codexConfig) ? "pass" : "warning", /\[mcp_servers\.serena\]/i.test(codexConfig) ? "Codex Serena MCP configured" : "Codex Serena MCP missing"));
    checks.push(finding("codex-context7", "current-docs", /\[mcp_servers\.context7\]/i.test(codexConfig) ? "pass" : "warning", /\[mcp_servers\.context7\]/i.test(codexConfig) ? "Codex Context7 MCP configured" : "Codex Context7 MCP missing"));
  }

  const claudeSettingsText = await readOptional(join(appPaths.home, ".claude", "settings.json"));
  const claudeStateText = await readOptional(join(appPaths.home, ".claude.json"));
  const claudeSettings = parseJsonc<Record<string, unknown>>(claudeSettingsText || "{}", "Claude settings");
  const claudeState = parseJsonc<Record<string, unknown>>(claudeStateText || "{}", "Claude state");
  if (found.has("claude")) {
    const plugins = (claudeSettings.enabledPlugins ?? {}) as Record<string, unknown>;
    checks.push(finding("claude-context-mode", "context-protection", Object.prototype.hasOwnProperty.call(plugins, "context-mode@context-mode") ? "pass" : "warning", Object.prototype.hasOwnProperty.call(plugins, "context-mode@context-mode") ? "Claude context-mode plugin configured" : "Claude context-mode plugin missing"));
    checks.push(finding("claude-serena", "semantic-code", containsKeyDeep(claudeState, "serena") ? "pass" : "warning", containsKeyDeep(claudeState, "serena") ? "Claude Serena MCP configured" : "Claude Serena MCP missing"));
    checks.push(finding("claude-context7", "current-docs", containsKeyDeep(claudeState, "context7") ? "pass" : "warning", containsKeyDeep(claudeState, "context7") ? "Claude Context7 MCP configured" : "Claude Context7 MCP missing"));
  }

  const opencodeText = await readOptional(join(appPaths.configDir, "opencode", "opencode.json"));
  const opencode = parseJsonc<Record<string, unknown>>(opencodeText || "{}", "OpenCode config");
  if (found.has("opencode")) {
    const plugins = Array.isArray(opencode.plugin) ? opencode.plugin : [];
    const mcp = (opencode.mcp ?? {}) as Record<string, unknown>;
    checks.push(finding("opencode-context-mode", "context-protection", plugins.includes("context-mode") ? "pass" : "warning", plugins.includes("context-mode") ? "OpenCode context-mode plugin configured" : "OpenCode context-mode plugin missing"));
    checks.push(finding("opencode-serena", "semantic-code", Object.prototype.hasOwnProperty.call(mcp, "serena") ? "pass" : "warning", Object.prototype.hasOwnProperty.call(mcp, "serena") ? "OpenCode Serena MCP configured" : "OpenCode Serena MCP missing"));
    checks.push(finding("opencode-context7", "current-docs", Object.prototype.hasOwnProperty.call(mcp, "context7") ? "pass" : "warning", Object.prototype.hasOwnProperty.call(mcp, "context7") ? "OpenCode Context7 MCP configured" : "OpenCode Context7 MCP missing"));
  }

  const genericMcpProviders = Object.entries(resolved.selections).flatMap(([capability, selection]) => {
    if (!capabilityIsActive(selection) || !selection.provider || ["serena", "context7"].includes(selection.provider)) return [];
    const provider = resolved.providers[selection.provider];
    return provider?.kind === "mcp" ? [{ capability, providerName: selection.provider, provider }] : [];
  });
  for (const { capability, providerName, provider } of genericMcpProviders) {
    const serverName = provider.serverName ?? providerName;
    const codexConfigured = new RegExp(`\\[mcp_servers\\.(?:"${serverName}"|${serverName})\\]`, "i").test(codexConfig);
    const opencodeMcp = (opencode.mcp ?? {}) as Record<string, unknown>;
    const integrations: Array<[ClientName, string, boolean]> = [
      ["codex", "Codex", codexConfigured],
      ["claude", "Claude Code", containsKeyDeep(claudeState, serverName)],
      ["opencode", "OpenCode", Object.prototype.hasOwnProperty.call(opencodeMcp, serverName)],
    ];
    for (const [client, label, configured] of integrations) {
      if (!found.has(client) || !provider.clients.includes(client)) continue;
      checks.push(finding(
        `${client}-${serverName}`,
        capability,
        configured ? "pass" : "warning",
        configured ? `${label} ${serverName} MCP configured` : `${label} ${serverName} MCP missing`,
      ));
    }
  }

  const roots = { agents: join(appPaths.home, ".agents", "skills"), claude: join(appPaths.home, ".claude", "skills") };
  let agentNames: string[] = [];
  let claudeNames: string[] = [];
  try { agentNames = await readdir(roots.agents); } catch { /* Optional. */ }
  try { claudeNames = await readdir(roots.claude); } catch { /* Optional. */ }
  const common = agentNames.filter((name) => claudeNames.includes(name));
  const divergent: string[] = [];
  for (const name of common) {
    const agentPath = join(roots.agents, name);
    const claudePath = join(roots.claude, name);
    try {
      const [agentStat, claudeStat] = await Promise.all([lstat(agentPath), lstat(claudePath)]);
      if (agentStat.isSymbolicLink() && claudeStat.isSymbolicLink() && (await readlink(agentPath)) === (await readlink(claudePath))) continue;
    } catch { /* Fall through to hashing. */ }
    if ((await hashDirectory(agentPath)) !== (await hashDirectory(claudePath))) divergent.push(name);
  }
  checks.push(finding("skill-divergence", "workflow-core", divergent.length ? "warning" : "pass", divergent.length ? `Divergent duplicate skills: ${divergent.sort().join(", ")}` : `${common.length} duplicate skill names are content-identical or share a target`));
  checks.push({ id: "doctor-duration", capability: "reporting", status: "info", summary: `Doctor completed in ${Date.now() - started}ms`, durationMs: Date.now() - started });
  return checks;
}

export function detectedClients(checks: Finding[]): ClientName[] {
  return (["codex", "claude", "opencode"] as const).filter((client) => checks.some((check) => check.id === `binary-${client}` && check.status === "pass"));
}
