import { createHash } from "node:crypto";
import { lstat, readFile, readdir, readlink } from "node:fs/promises";
import { basename, join } from "node:path";

import { findExecutable } from "./commands.js";
import { parseJsonc, setJsoncValue } from "./jsonc.js";
import { upsertMarkdownBlock } from "./managed-block.js";
import { pathExists, resolveAppPaths } from "./paths.js";
import { loadPreset, loadSkillSources, loadToolRegistry, packageVersion } from "./registry.js";
import type { ClientName, GlobalOptions, InstallPlan, PlanItem } from "./types.js";
import { loadUserConfig } from "./user-config.js";

async function readOptional(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "";
    throw error;
  }
}

async function directoryNames(path: string): Promise<string[]> {
  try {
    const entries = await readdir(path, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function planSymlink(items: PlanItem[], id: string, source: string, target: string, adoptExisting = false): Promise<void> {
  try {
    const stat = await lstat(target);
    if (stat.isSymbolicLink()) {
      const current = await readlink(target);
      if (current === source) return;
    }
    if (stat.isDirectory() && await directoryDigest(source) === await directoryDigest(target)) {
      items.push({
        kind: "symlink",
        id,
        description: `Adopt content-identical skill ${target}`,
        source,
        target,
        replaceExisting: true,
      });
      return;
    }
    if (adoptExisting) {
      items.push({
        kind: "symlink",
        id,
        description: `Back up and adopt existing skill ${target}`,
        source,
        target,
        replaceExisting: true,
      });
      return;
    }
    items.push({
      kind: "notice",
      id: `${id}-conflict`,
      description: `Preserved unmanaged path: ${target}`,
      level: "warn",
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    items.push({ kind: "symlink", id, description: `Link ${target}`, source, target });
  }
}

function containsKeyDeep(value: unknown, key: string): boolean {
  if (!value || typeof value !== "object") return false;
  if (Object.prototype.hasOwnProperty.call(value, key)) return true;
  return Object.values(value as Record<string, unknown>).some((child) => containsKeyDeep(child, key));
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

async function directoryDigest(path: string): Promise<string | null> {
  const hash = createHash("sha256");
  try {
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
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function buildInstallPlan(options: GlobalOptions): Promise<InstallPlan> {
  const root = options.root;
  const appPaths = resolveAppPaths(options.home);
  const userConfig = await loadUserConfig(options.home);
  const presetName = options.preset ?? userConfig.preset ?? "recommended";
  const [basePreset, tools, skillSources, version] = await Promise.all([
    loadPreset(root, presetName),
    loadToolRegistry(root),
    loadSkillSources(root),
    packageVersion(root),
  ]);
  const preset = {
    ...basePreset,
    components: { ...basePreset.components, ...userConfig.components },
  };
  if (userConfig.externalSkillSets !== undefined) preset.externalSkillSets = userConfig.externalSkillSets;

  const configPaths = {
    codex: join(appPaths.home, ".codex", "config.toml"),
    codexAgents: join(appPaths.home, ".codex", "AGENTS.md"),
    claudeSettings: join(appPaths.home, ".claude", "settings.json"),
    claudeState: join(appPaths.home, ".claude.json"),
    claudeInstructions: join(appPaths.home, ".claude", "CLAUDE.md"),
    opencode: join(appPaths.configDir, "opencode", "opencode.json"),
    opencodeInstructions: join(appPaths.configDir, "opencode", "AGENTS.md"),
  };

  const detectedClients: Record<ClientName, boolean> = {
    codex: Boolean(findExecutable("codex")) || pathExists(join(appPaths.home, ".codex")),
    claude: Boolean(findExecutable("claude")) || pathExists(join(appPaths.home, ".claude")),
    opencode: Boolean(findExecutable("opencode")) || pathExists(join(appPaths.configDir, "opencode")),
  };
  const configuredClients = userConfig.clients;
  const clients: Record<ClientName, boolean> = configuredClients && configuredClients !== "auto"
    ? {
        codex: configuredClients.includes("codex"),
        claude: configuredClients.includes("claude"),
        opencode: configuredClients.includes("opencode"),
      }
    : detectedClients;
  const items: PlanItem[] = [];
  const releaseDir = join(appPaths.appDataDir, "releases", version);
  const releaseSkills = join(releaseDir, "skills");
  const bundledSkillNames = preset.components.bundledSkills ? await directoryNames(join(root, "skills")) : [];
  for (const name of bundledSkillNames) {
    const source = join(root, "skills", name);
    const target = join(releaseSkills, name);
    if ((await directoryDigest(source)) !== (await directoryDigest(target))) {
      items.push({ kind: "copy-dir", id: `copy-bundled-skill-${name}`, description: `Install Orditra skill ${name} into release ${version}`, source, target });
    }
  }

  const externalSkillNames: string[] = [];
  if (preset.components.externalSkills && !options.skipExternal) {
    for (const setName of preset.externalSkillSets ?? []) {
      const sourceEntry = Object.entries(skillSources.sources).find(([, source]) => source.sets[setName]);
      if (!sourceEntry) throw new Error(`Unknown external skill set: ${setName}`);
      const [sourceName, source] = sourceEntry;
      externalSkillNames.push(...(source.sets[setName] ?? []).map((path) => basename(path)));
      const missing = (source.sets[setName] ?? []).some((path) => !pathExists(join(releaseSkills, basename(path))));
      if (missing) {
        items.push({
          kind: "external-skills",
          id: `external-${sourceName}-${setName}`,
          description: `Install pinned ${sourceName} skill set ${setName}`,
          sourceName,
          skillSet: setName,
          target: releaseSkills,
        });
      }
    }
  } else if (preset.components.externalSkills && options.skipExternal) {
    items.push({ kind: "notice", id: "external-skills-skipped", description: "External skill sources skipped by request", level: "info" });
  }

  if (preset.components.policies) {
    const core = await readFile(join(root, "policies", "core.md"), "utf8");
    const policyTargets: Array<[ClientName, string, string]> = [
      ["codex", configPaths.codexAgents, "codex.md"],
      ["claude", configPaths.claudeInstructions, "claude.md"],
      ["opencode", configPaths.opencodeInstructions, "opencode.md"],
    ];
    for (const [client, target, clientPolicy] of policyTargets) {
      if (!clients[client]) continue;
      const original = await readOptional(target);
      const adapter = await readFile(join(root, "policies", clientPolicy), "utf8");
      const content = upsertMarkdownBlock(original, `${core.trim()}\n\n${adapter.trim()}`);
      if (content !== original) {
        items.push({ kind: "write", id: `policy-${client}`, description: `Update ${client} global guidance`, target, content });
      }
    }
  }

  const skillNames = unique([...bundledSkillNames, ...externalSkillNames]).sort();
  for (const name of skillNames) {
    const source = join(releaseSkills, name);
    if (clients.codex || clients.opencode) {
      await planSymlink(items, `agents-skill-${name}`, source, join(appPaths.home, ".agents", "skills", name), options.adoptExisting);
    }
    if (clients.claude) {
      await planSymlink(items, `claude-skill-${name}`, source, join(appPaths.home, ".claude", "skills", name), options.adoptExisting);
    }
  }

  const codexConfig = await readOptional(configPaths.codex);
  const claudeSettingsText = await readOptional(configPaths.claudeSettings);
  const claudeStateText = await readOptional(configPaths.claudeState);
  const claudeSettings = parseJsonc<Record<string, unknown>>(claudeSettingsText || "{}", configPaths.claudeSettings);
  const claudeState = parseJsonc<Record<string, unknown>>(claudeStateText || "{}", configPaths.claudeState);
  let opencodeText = await readOptional(configPaths.opencode);
  const opencode = parseJsonc<Record<string, unknown>>(opencodeText || "{}", configPaths.opencode);

  if (preset.components.contextMode) {
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
  }

  if (preset.components.serena) {
    const serena = findExecutable("serena");
    const uvx = findExecutable("uvx");
    const commit = tools.tools.serena?.commit;
    if (!commit) throw new Error("Serena commit is missing from tools.yaml");
    const launch = serena
      ? { command: serena, prefix: [] as string[] }
      : uvx
        ? { command: uvx, prefix: ["--from", `git+https://github.com/oraios/serena@${commit}`, "serena"] }
        : null;
    if (!launch) {
      items.push({ kind: "notice", id: "serena-missing", description: "Serena requires either serena or uvx on PATH", level: "error" });
    } else {
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
    }
  }

  if (clients.opencode && opencodeText !== (await readOptional(configPaths.opencode))) {
    items.push({ kind: "write", id: "opencode-config", description: "Merge Orditra integrations into OpenCode", target: configPaths.opencode, content: opencodeText });
  }

  if (preset.components.astGrep && !findExecutable("sg") && !findExecutable("ast-grep")) {
    items.push({ kind: "notice", id: "ast-grep-missing", description: "ast-grep is not installed; install @ast-grep/cli before structural workflows", level: "warn" });
  }

  return { preset, items, clients, releaseDir };
}
