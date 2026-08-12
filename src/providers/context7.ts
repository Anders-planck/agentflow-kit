import { findExecutable } from "../commands.js";
import { setJsoncValue } from "../jsonc.js";
import { containsKeyDeep } from "../planning/shared.js";
import type { ClientName, PlanItem } from "../types.js";

export interface Context7Input {
  items: PlanItem[];
  clients: Record<ClientName, boolean>;
  endpoint: string;
  codexConfig: string;
  claudeState: Record<string, unknown>;
  opencode: Record<string, unknown>;
  opencodeText: string;
}

export function planContext7(input: Context7Input): string {
  const { items, clients, endpoint, codexConfig, claudeState, opencode } = input;
  let opencodeText = input.opencodeText;
  if (clients.codex && !/\[mcp_servers\.context7\]/i.test(codexConfig)) {
    const codex = findExecutable("codex") ?? "codex";
    items.push({
      kind: "command",
      id: "codex-context7",
      description: "Add Context7 MCP to Codex",
      spec: {
        command: codex,
        args: ["mcp", "add", "context7", "--url", endpoint],
        inverse: { command: codex, args: ["mcp", "remove", "context7"] },
      },
    });
  }
  if (clients.claude && !containsKeyDeep(claudeState, "context7")) {
    const claude = findExecutable("claude") ?? "claude";
    items.push({
      kind: "command",
      id: "claude-context7",
      description: "Add Context7 MCP to Claude Code user scope",
      spec: {
        command: claude,
        args: ["mcp", "add", "--transport", "http", "--scope", "user", "context7", endpoint],
        inverse: { command: claude, args: ["mcp", "remove", "--scope", "user", "context7"] },
      },
    });
  }
  if (clients.opencode) {
    const expected = { type: "remote", url: endpoint, enabled: true };
    const current = (opencode.mcp as Record<string, unknown> | undefined)?.context7;
    if (JSON.stringify(current) !== JSON.stringify(expected)) opencodeText = setJsoncValue(opencodeText, ["mcp", "context7"], expected);
  }
  return opencodeText;
}
