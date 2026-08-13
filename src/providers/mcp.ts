import { findExecutable } from "../commands.js";
import { setJsoncValue } from "../jsonc.js";
import { containsKeyDeep } from "../planning/shared.js";
import type { ClientName, PlanItem, ProviderDefinition } from "../types.js";

export interface McpProviderInput {
  items: PlanItem[];
  clients: Record<ClientName, boolean>;
  providerName: string;
  provider: ProviderDefinition;
  codexConfig: string;
  claudeState: Record<string, unknown>;
  opencode: Record<string, unknown>;
  opencodeText: string;
  assumedExecutables?: string[];
}

export function planMcpProvider(input: McpProviderInput): string {
  const { items, clients, providerName, provider, codexConfig, claudeState, opencode } = input;
  const serverName = provider.serverName ?? providerName;
  let opencodeText = input.opencodeText;
  const isRemote = provider.transport === "http";
  const executable = provider.executable
    ? findExecutable(provider.executable) ?? (input.assumedExecutables?.includes(provider.executable) ? provider.executable : null)
    : null;
  if (isRemote && !provider.endpoint) throw new Error(`MCP provider ${providerName} has no endpoint`);
  if (!isRemote && !executable) {
    items.push({
      kind: "notice",
      id: `${serverName}-missing`,
      description: `${provider.description} requires ${provider.executable ?? "an executable"} on PATH`,
      level: "error",
    });
    return opencodeText;
  }

  const args = provider.args ?? [];
  if (clients.codex && !new RegExp(`\\[mcp_servers\\.${serverName}\\]`, "i").test(codexConfig)) {
    const codex = findExecutable("codex") ?? "codex";
    items.push({
      kind: "command",
      id: `codex-${serverName}`,
      description: `Add ${serverName} MCP to Codex`,
      spec: {
        command: codex,
        args: isRemote
          ? ["mcp", "add", serverName, "--url", provider.endpoint!]
          : ["mcp", "add", serverName, "--", executable!, ...args],
        inverse: { command: codex, args: ["mcp", "remove", serverName] },
      },
    });
  }
  if (clients.claude && !containsKeyDeep(claudeState, serverName)) {
    const claude = findExecutable("claude") ?? "claude";
    items.push({
      kind: "command",
      id: `claude-${serverName}`,
      description: `Add ${serverName} MCP to Claude Code user scope`,
      spec: {
        command: claude,
        args: isRemote
          ? ["mcp", "add", "--transport", "http", "--scope", "user", serverName, provider.endpoint!]
          : ["mcp", "add", "--scope", "user", serverName, "--", executable!, ...args],
        inverse: { command: claude, args: ["mcp", "remove", "--scope", "user", serverName] },
      },
    });
  }
  if (clients.opencode) {
    const expected = isRemote
      ? { type: "remote", url: provider.endpoint!, enabled: true }
      : { type: "local", command: [executable!, ...args], enabled: true };
    const current = (opencode.mcp as Record<string, unknown> | undefined)?.[serverName];
    if (JSON.stringify(current) !== JSON.stringify(expected)) {
      opencodeText = setJsoncValue(opencodeText, ["mcp", serverName], expected);
    }
  }
  return opencodeText;
}
