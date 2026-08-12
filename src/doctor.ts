import { createHash } from "node:crypto";
import { lstat, readFile, readdir, readlink } from "node:fs/promises";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { findExecutable } from "./commands.js";
import { parseJsonc } from "./jsonc.js";
import { resolveAppPaths } from "./paths.js";
import type { ClientName } from "./types.js";

export interface DoctorCheck {
  id: string;
  status: "ok" | "warn" | "fail";
  message: string;
}

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

function containsKeyDeep(value: unknown, key: string): boolean {
  if (!value || typeof value !== "object") return false;
  if (Object.prototype.hasOwnProperty.call(value, key)) return true;
  return Object.values(value as Record<string, unknown>).some((child) => containsKeyDeep(child, key));
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

export async function runDoctor(home: string): Promise<DoctorCheck[]> {
  const appPaths = resolveAppPaths(home);
  const checks: DoctorCheck[] = [];
  const binaries: Array<[string, string]> = [
    ["codex", "Codex"], ["claude", "Claude Code"], ["opencode", "OpenCode"],
    ["serena", "Serena"], ["sg", "ast-grep"], ["uvx", "uvx"], ["node", "Node.js"],
  ];
  const found = new Map<string, string>();
  for (const [binary, label] of binaries) {
    const executable = findExecutable(binary);
    if (executable) {
      found.set(binary, executable);
      checks.push({ id: `binary-${binary}`, status: "ok", message: `${label}: ${versionOf(executable)}` });
    } else if (["serena", "sg"].includes(binary)) {
      checks.push({ id: `binary-${binary}`, status: "warn", message: `${label} not found on PATH` });
    }
  }

  const codexConfig = await readOptional(join(appPaths.home, ".codex", "config.toml"));
  if (found.has("codex")) {
    checks.push({
      id: "codex-context-mode",
      status: /plugins\."context-mode@context-mode"/.test(codexConfig) ? "ok" : "warn",
      message: /plugins\."context-mode@context-mode"/.test(codexConfig) ? "Codex context-mode plugin configured" : "Codex context-mode plugin missing",
    });
    checks.push({
      id: "codex-serena",
      status: /\[mcp_servers\.serena\]/i.test(codexConfig) ? "ok" : "warn",
      message: /\[mcp_servers\.serena\]/i.test(codexConfig) ? "Codex Serena MCP configured" : "Codex Serena MCP missing",
    });
  }

  const claudeSettingsText = await readOptional(join(appPaths.home, ".claude", "settings.json"));
  const claudeStateText = await readOptional(join(appPaths.home, ".claude.json"));
  const claudeSettings = parseJsonc<Record<string, unknown>>(claudeSettingsText || "{}", "Claude settings");
  const claudeState = parseJsonc<Record<string, unknown>>(claudeStateText || "{}", "Claude state");
  if (found.has("claude")) {
    const plugins = (claudeSettings.enabledPlugins ?? {}) as Record<string, unknown>;
    checks.push({
      id: "claude-context-mode",
      status: Object.prototype.hasOwnProperty.call(plugins, "context-mode@context-mode") ? "ok" : "warn",
      message: Object.prototype.hasOwnProperty.call(plugins, "context-mode@context-mode") ? "Claude context-mode plugin configured" : "Claude context-mode plugin missing",
    });
    checks.push({
      id: "claude-serena",
      status: containsKeyDeep(claudeState, "serena") ? "ok" : "warn",
      message: containsKeyDeep(claudeState, "serena") ? "Claude Serena MCP configured" : "Claude Serena MCP missing",
    });
  }

  const opencodeText = await readOptional(join(appPaths.configDir, "opencode", "opencode.json"));
  const opencode = parseJsonc<Record<string, unknown>>(opencodeText || "{}", "OpenCode config");
  if (found.has("opencode")) {
    const plugins = Array.isArray(opencode.plugin) ? opencode.plugin : [];
    const mcp = (opencode.mcp ?? {}) as Record<string, unknown>;
    checks.push({ id: "opencode-context-mode", status: plugins.includes("context-mode") ? "ok" : "warn", message: plugins.includes("context-mode") ? "OpenCode context-mode plugin configured" : "OpenCode context-mode plugin missing" });
    checks.push({ id: "opencode-serena", status: Object.prototype.hasOwnProperty.call(mcp, "serena") ? "ok" : "warn", message: Object.prototype.hasOwnProperty.call(mcp, "serena") ? "OpenCode Serena MCP configured" : "OpenCode Serena MCP missing" });
  }

  const roots: Record<"agents" | "claude", string> = {
    agents: join(appPaths.home, ".agents", "skills"),
    claude: join(appPaths.home, ".claude", "skills"),
  };
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
      if (agentStat.isSymbolicLink() && claudeStat.isSymbolicLink()) {
        if ((await readlink(agentPath)) === (await readlink(claudePath))) continue;
      }
    } catch { /* Fall through to hashing. */ }
    if ((await hashDirectory(agentPath)) !== (await hashDirectory(claudePath))) divergent.push(name);
  }
  checks.push({
    id: "skill-divergence",
    status: divergent.length ? "warn" : "ok",
    message: divergent.length ? `Divergent duplicate skills: ${divergent.sort().join(", ")}` : `${common.length} duplicate skill names are content-identical or share a target`,
  });
  return checks;
}

export function detectedClients(checks: DoctorCheck[]): ClientName[] {
  return (["codex", "claude", "opencode"] as const).filter((client) => checks.some((check) => check.id === `binary-${client}` && check.status === "ok"));
}

