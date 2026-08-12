import { findExecutable } from "../commands.js";
import { setJsoncValue } from "../jsonc.js";
import type { ClientName, PlanItem } from "../types.js";

export interface ContextModeInput {
  items: PlanItem[];
  clients: Record<ClientName, boolean>;
  codexConfig: string;
  claudeSettings: Record<string, unknown>;
  opencode: Record<string, unknown>;
  opencodeText: string;
}

export function planContextMode(input: ContextModeInput): string {
  const { items, clients, codexConfig, claudeSettings, opencode } = input;
  let opencodeText = input.opencodeText;
  if (clients.codex && !/plugins\."context-mode@context-mode"/.test(codexConfig)) {
    if (!/marketplaces\.context-mode/.test(codexConfig)) {
      items.push({
        kind: "command",
        id: "codex-context-mode-marketplace",
        description: "Add the context-mode Codex marketplace",
        spec: {
          command: findExecutable("codex") ?? "codex",
          args: ["plugin", "marketplace", "add", "mksglu/context-mode", "--json"],
          inverse: { command: findExecutable("codex") ?? "codex", args: ["plugin", "marketplace", "remove", "context-mode"] },
        },
      });
    }
    items.push({
      kind: "command",
      id: "codex-context-mode-plugin",
      description: "Install the context-mode Codex plugin",
      spec: {
        command: findExecutable("codex") ?? "codex",
        args: ["plugin", "add", "context-mode@context-mode", "--json"],
        inverse: { command: findExecutable("codex") ?? "codex", args: ["plugin", "remove", "context-mode@context-mode"] },
      },
    });
  }

  const enabledPlugins = (claudeSettings.enabledPlugins ?? {}) as Record<string, unknown>;
  if (clients.claude && !Object.prototype.hasOwnProperty.call(enabledPlugins, "context-mode@context-mode")) {
    const claude = findExecutable("claude") ?? "claude";
    items.push({
      kind: "command",
      id: "claude-context-mode-marketplace",
      description: "Add the context-mode Claude marketplace",
      spec: { command: claude, args: ["plugin", "marketplace", "add", "mksglu/context-mode", "--scope", "user"] },
    });
    items.push({
      kind: "command",
      id: "claude-context-mode-plugin",
      description: "Install the context-mode Claude plugin",
      spec: {
        command: claude,
        args: ["plugin", "install", "context-mode@context-mode", "--scope", "user"],
        inverse: { command: claude, args: ["plugin", "uninstall", "context-mode@context-mode"] },
      },
    });
  }

  if (clients.opencode) {
    const plugins = Array.isArray(opencode.plugin) ? opencode.plugin.filter((value): value is string => typeof value === "string") : [];
    if (!plugins.includes("context-mode")) opencodeText = setJsoncValue(opencodeText, ["plugin"], [...plugins, "context-mode"]);
  }
  return opencodeText;
}
