import { join } from "node:path";

import type { AppPaths } from "../types.js";

export interface ClientConfigPaths {
  codex: string;
  codexAgents: string;
  claudeSettings: string;
  claudeState: string;
  claudeInstructions: string;
  opencode: string;
  opencodeInstructions: string;
}

export function clientConfigPaths(appPaths: AppPaths): ClientConfigPaths {
  return {
    codex: join(appPaths.home, ".codex", "config.toml"),
    codexAgents: join(appPaths.home, ".codex", "AGENTS.md"),
    claudeSettings: join(appPaths.home, ".claude", "settings.json"),
    claudeState: join(appPaths.home, ".claude.json"),
    claudeInstructions: join(appPaths.home, ".claude", "CLAUDE.md"),
    opencode: join(appPaths.configDir, "opencode", "opencode.json"),
    opencodeInstructions: join(appPaths.configDir, "opencode", "AGENTS.md"),
  };
}
