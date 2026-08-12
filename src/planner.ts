import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";

import { capabilityIsActive, resolveCapabilities } from "./capabilities.js";
import { clientConfigPaths } from "./clients/config.js";
import { findExecutable } from "./commands.js";
import { parseJsonc } from "./jsonc.js";
import { upsertMarkdownBlock } from "./managed-block.js";
import { pathExists, resolveAppPaths } from "./paths.js";
import { directoryDigest, planSymlink, readOptional, unique } from "./planning/shared.js";
import { planCliProviderNotices } from "./providers/cli.js";
import { planContextMode } from "./providers/context-mode.js";
import { planContext7 } from "./providers/context7.js";
import { planSerena } from "./providers/serena.js";
import { loadPreset, loadSkillSources, packageVersion } from "./registry.js";
import type { ClientName, GlobalOptions, InstallPlan, PlanItem, Preset } from "./types.js";
import { loadUserConfig } from "./user-config.js";

function detectClients(home: string, configDir: string): Record<ClientName, boolean> {
  return {
    codex: Boolean(findExecutable("codex")) || pathExists(join(home, ".codex")),
    claude: Boolean(findExecutable("claude")) || pathExists(join(home, ".claude")),
    opencode: Boolean(findExecutable("opencode")) || pathExists(join(configDir, "opencode")),
  };
}

function selectClients(configured: "auto" | ClientName[] | undefined, detected: Record<ClientName, boolean>): Record<ClientName, boolean> {
  if (!configured || configured === "auto") return detected;
  return {
    codex: configured.includes("codex"),
    claude: configured.includes("claude"),
    opencode: configured.includes("opencode"),
  };
}

export async function buildInstallPlan(options: GlobalOptions): Promise<InstallPlan> {
  const root = options.root;
  const appPaths = resolveAppPaths(options.home);
  const userConfig = await loadUserConfig(options.home, root);
  const presetName = options.preset ?? userConfig.preset ?? "recommended";
  const [basePreset, skillSources, version] = await Promise.all([
    loadPreset(root, presetName),
    loadSkillSources(root),
    packageVersion(root),
  ]);
  const resolved = await resolveCapabilities(root, basePreset, userConfig);
  const preset: Preset = {
    ...basePreset,
    components: resolved.components,
    capabilities: resolved.selections,
    ...(userConfig.externalSkillSets !== undefined ? { externalSkillSets: userConfig.externalSkillSets } : {}),
  };

  const configPaths = clientConfigPaths(appPaths);
  const clients = selectClients(userConfig.clients, detectClients(appPaths.home, appPaths.configDir));
  const items: PlanItem[] = [];
  const managedReleasesDir = join(appPaths.appDataDir, "releases");
  const releaseDir = join(managedReleasesDir, version);
  const releaseSkills = join(releaseDir, "skills");

  const bundledSkillNames = unique(Object.entries(resolved.selections)
    .filter(([, selection]) => capabilityIsActive(selection))
    .flatMap(([name]) => resolved.definitions[name]?.skills ?? []))
    .sort();
  for (const name of bundledSkillNames) {
    const source = join(root, "skills", name);
    if (!pathExists(source)) throw new Error(`Capability references missing bundled skill: ${name}`);
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
    const targets: Array<[ClientName, string, string]> = [
      ["codex", configPaths.codexAgents, "codex.md"],
      ["claude", configPaths.claudeInstructions, "claude.md"],
      ["opencode", configPaths.opencodeInstructions, "opencode.md"],
    ];
    for (const [client, target, policy] of targets) {
      if (!clients[client]) continue;
      const original = await readOptional(target);
      const adapter = await readFile(join(root, "policies", policy), "utf8");
      const content = upsertMarkdownBlock(original, `${core.trim()}\n\n${adapter.trim()}`);
      if (content !== original) items.push({ kind: "write", id: `policy-${client}`, description: `Update ${client} global guidance`, target, content });
    }
  }

  const skillNames = unique([...bundledSkillNames, ...externalSkillNames]).sort();
  for (const name of skillNames) {
    const source = join(releaseSkills, name);
    if (clients.codex || clients.opencode) {
      await planSymlink(items, `agents-skill-${name}`, source, join(appPaths.home, ".agents", "skills", name), managedReleasesDir, options.adoptExisting);
    }
    if (clients.claude) {
      await planSymlink(items, `claude-skill-${name}`, source, join(appPaths.home, ".claude", "skills", name), managedReleasesDir, options.adoptExisting);
    }
  }

  const codexConfig = await readOptional(configPaths.codex);
  const claudeSettingsText = await readOptional(configPaths.claudeSettings);
  const claudeStateText = await readOptional(configPaths.claudeState);
  const claudeSettings = parseJsonc<Record<string, unknown>>(claudeSettingsText || "{}", configPaths.claudeSettings);
  const claudeState = parseJsonc<Record<string, unknown>>(claudeStateText || "{}", configPaths.claudeState);
  const originalOpencodeText = await readOptional(configPaths.opencode);
  let opencodeText = originalOpencodeText;
  const opencode = parseJsonc<Record<string, unknown>>(opencodeText || "{}", configPaths.opencode);

  if (capabilityIsActive(resolved.selections["context-protection"])) {
    opencodeText = planContextMode({ items, clients, codexConfig, claudeSettings, opencode, opencodeText });
  }
  if (capabilityIsActive(resolved.selections["semantic-code"])) {
    const commit = resolved.providers.serena?.commit;
    if (!commit) throw new Error("Serena commit is missing from tools.yaml");
    opencodeText = planSerena({
      items,
      clients,
      commit,
      codexConfig,
      claudeState,
      opencode,
      opencodeText,
      ...(options.assumedExecutables ? { assumedExecutables: options.assumedExecutables } : {}),
    });
  }
  if (capabilityIsActive(resolved.selections["current-docs"])) {
    const providerName = resolved.selections["current-docs"]?.provider;
    const endpoint = providerName ? resolved.providers[providerName]?.endpoint : undefined;
    if (!endpoint) throw new Error("Current-docs provider has no endpoint");
    opencodeText = planContext7({ items, clients, endpoint, codexConfig, claudeState, opencode, opencodeText });
  }
  if (clients.opencode && opencodeText !== originalOpencodeText) {
    items.push({ kind: "write", id: "opencode-config", description: "Merge Orditra integrations into OpenCode", target: configPaths.opencode, content: opencodeText });
  }

  planCliProviderNotices(items, resolved.selections, resolved.providers, options.assumedExecutables);
  return { preset, items, clients, capabilities: resolved.selections, releaseDir };
}
