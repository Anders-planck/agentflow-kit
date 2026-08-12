import { findExecutable } from "../commands.js";
import { setJsoncValue } from "../jsonc.js";
import { containsKeyDeep } from "../planning/shared.js";
import type { ClientName, PlanItem } from "../types.js";

export interface SerenaInput {
  items: PlanItem[];
  clients: Record<ClientName, boolean>;
  commit: string;
  codexConfig: string;
  claudeState: Record<string, unknown>;
  opencode: Record<string, unknown>;
  opencodeText: string;
  assumedExecutables?: string[];
}

export function planSerena(input: SerenaInput): string {
  const { items, clients, commit, codexConfig, claudeState, opencode } = input;
  let opencodeText = input.opencodeText;
  const serena = findExecutable("serena") ?? (input.assumedExecutables?.includes("serena") ? "serena" : null);
  const uvx = findExecutable("uvx") ?? (input.assumedExecutables?.includes("uvx") ? "uvx" : null);
  const launch = serena
    ? { command: serena, prefix: [] as string[] }
    : uvx
      ? { command: uvx, prefix: ["--from", `git+https://github.com/oraios/serena@${commit}`, "serena"] }
      : null;
  if (!launch) {
    items.push({ kind: "notice", id: "serena-missing", description: "Serena requires either serena or uvx on PATH", level: "error" });
    return opencodeText;
  }
  if (clients.codex && !/\[mcp_servers\.serena\]/i.test(codexConfig)) {
    const codex = findExecutable("codex") ?? "codex";
    items.push({
      kind: "command",
      id: "codex-serena",
      description: "Add Serena MCP to Codex",
      spec: {
        command: codex,
        args: ["mcp", "add", "serena", "--", launch.command, ...launch.prefix, "start-mcp-server", "--project-from-cwd", "--context=codex"],
        inverse: { command: codex, args: ["mcp", "remove", "serena"] },
      },
    });
  }
  if (clients.claude && !containsKeyDeep(claudeState, "serena")) {
    const claude = findExecutable("claude") ?? "claude";
    items.push({
      kind: "command",
      id: "claude-serena",
      description: "Add Serena MCP to Claude Code user scope",
      spec: {
        command: claude,
        args: ["mcp", "add", "--scope", "user", "serena", "--", launch.command, ...launch.prefix, "start-mcp-server", "--project-from-cwd", "--context=claude-code"],
        inverse: { command: claude, args: ["mcp", "remove", "--scope", "user", "serena"] },
      },
    });
  }
  if (clients.opencode) {
    const expected = {
      type: "local",
      command: [launch.command, ...launch.prefix, "start-mcp-server", "--project-from-cwd", "--context=ide"],
      enabled: true,
      timeout: 20000,
    };
    const current = (opencode.mcp as Record<string, unknown> | undefined)?.serena;
    if (JSON.stringify(current) !== JSON.stringify(expected)) opencodeText = setJsoncValue(opencodeText, ["mcp", "serena"], expected);
  }
  return opencodeText;
}
