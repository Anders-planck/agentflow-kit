import { readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { parse, stringify } from "yaml";

import { findProjectRoot, resolveAppPaths, resolveLegacyAppPaths } from "./paths.js";
import { validateSchema } from "./registry.js";
import type { CapabilitySelection, ClientName, Components, UserConfig } from "./types.js";

const CLIENTS = new Set<ClientName>(["codex", "claude", "opencode"]);
const COMPONENTS = new Set<keyof Components>([
  "policies",
  "bundledSkills",
  "externalSkills",
  "contextMode",
  "serena",
  "astGrep",
]);
const COMPONENT_CAPABILITIES: Record<keyof Components, string> = {
  policies: "policies",
  bundledSkills: "workflow-core",
  externalSkills: "external-skills",
  contextMode: "context-protection",
  serena: "semantic-code",
  astGrep: "structural-search",
};

async function readOptionalYaml(path: string): Promise<Record<string, unknown>> {
  try {
    const value = parse(await readFile(path, "utf8")) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Expected a YAML object: ${path}`);
    return value as Record<string, unknown>;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }
}

function validate(config: Record<string, unknown>): UserConfig {
  const allowed = new Set(["schemaVersion", "preset", "clients", "components", "capabilities", "profiles", "externalSkillSets"]);
  const unknown = Object.keys(config).filter((key) => !allowed.has(key));
  if (unknown.length) throw new Error(`Unknown user configuration keys: ${unknown.join(", ")}`);
  if (config.schemaVersion !== undefined && config.schemaVersion !== 1 && config.schemaVersion !== 2) throw new Error("User configuration schemaVersion must be 1 or 2");
  if (config.preset !== undefined && typeof config.preset !== "string") throw new Error("User configuration preset must be a string");

  const clients = config.clients;
  if (clients !== undefined && clients !== "auto") {
    if (!Array.isArray(clients) || clients.some((client) => typeof client !== "string" || !CLIENTS.has(client as ClientName))) {
      throw new Error("User configuration clients must be auto or a list containing codex, claude, and/or opencode");
    }
  }

  const components = config.components;
  if (components !== undefined) {
    if (!components || typeof components !== "object" || Array.isArray(components)) throw new Error("User configuration components must be an object");
    const entries = Object.entries(components as Record<string, unknown>);
    const invalid = entries.filter(([key, value]) => !COMPONENTS.has(key as keyof Components) || typeof value !== "boolean");
    if (invalid.length) throw new Error(`Invalid user configuration components: ${invalid.map(([key]) => key).join(", ")}`);
  }

  const skillSets = config.externalSkillSets;
  if (skillSets !== undefined && (!Array.isArray(skillSets) || skillSets.some((value) => typeof value !== "string"))) {
    throw new Error("User configuration externalSkillSets must be a list of strings");
  }

  const profiles = config.profiles;
  if (profiles !== undefined && (!Array.isArray(profiles) || profiles.some((value) => typeof value !== "string"))) {
    throw new Error("User configuration profiles must be a list of strings");
  }

  return {
    schemaVersion: config.schemaVersion === 2 ? 2 : 1,
    ...(config.preset !== undefined ? { preset: config.preset } : {}),
    ...(clients !== undefined ? { clients: clients as "auto" | ClientName[] } : {}),
    ...(components !== undefined ? { components: components as Partial<Components> } : {}),
    ...(config.capabilities !== undefined ? { capabilities: config.capabilities as Record<string, CapabilitySelection> } : {}),
    ...(profiles !== undefined ? { profiles: profiles as string[] } : {}),
    ...(skillSets !== undefined ? { externalSkillSets: skillSets as string[] } : {}),
  };
}

export async function loadUserConfig(home: string, root = findProjectRoot()): Promise<UserConfig> {
  const directory = resolveAppPaths(home).appConfigDir;
  const legacyDirectory = resolveLegacyAppPaths(home).appConfigDir;
  const [legacyShared, legacyLocal, shared, local] = await Promise.all([
    readOptionalYaml(join(legacyDirectory, "config.yaml")),
    readOptionalYaml(join(legacyDirectory, "config.local.yaml")),
    readOptionalYaml(join(directory, "config.yaml")),
    readOptionalYaml(join(directory, "config.local.yaml")),
  ]);
  const merged: Record<string, unknown> = {
    ...legacyShared,
    ...legacyLocal,
    ...shared,
    ...local,
    components: {
      ...((legacyShared.components as Record<string, unknown> | undefined) ?? {}),
      ...((legacyLocal.components as Record<string, unknown> | undefined) ?? {}),
      ...((shared.components as Record<string, unknown> | undefined) ?? {}),
      ...((local.components as Record<string, unknown> | undefined) ?? {}),
    },
    capabilities: {
      ...((legacyShared.capabilities as Record<string, unknown> | undefined) ?? {}),
      ...((legacyLocal.capabilities as Record<string, unknown> | undefined) ?? {}),
      ...((shared.capabilities as Record<string, unknown> | undefined) ?? {}),
      ...((local.capabilities as Record<string, unknown> | undefined) ?? {}),
    },
  };
  if (!Object.keys(merged.components as Record<string, unknown>).length) delete merged.components;
  if (!Object.keys(merged.capabilities as Record<string, unknown>).length) delete merged.capabilities;
  const validated = validate(merged);
  await validateSchema(root, "user-config", merged, "user configuration");
  return validated;
}

export interface ConfigMigrationResult {
  target: string;
  action: "missing" | "unchanged" | "migrate";
  content?: string;
}

export async function planUserConfigMigration(home: string): Promise<ConfigMigrationResult> {
  const target = join(resolveAppPaths(home).appConfigDir, "config.yaml");
  let raw: Record<string, unknown>;
  try { raw = parse(await readFile(target, "utf8")) as Record<string, unknown>; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return { target, action: "missing" }; throw error; }
  if (raw.schemaVersion === 2) return { target, action: "unchanged" };
  const components = (raw.components ?? {}) as Partial<Components>;
  const capabilities = { ...((raw.capabilities as Record<string, CapabilitySelection> | undefined) ?? {}) };
  for (const [component, enabled] of Object.entries(components)) {
    const capability = COMPONENT_CAPABILITIES[component as keyof Components];
    if (capability) capabilities[capability] = { mode: enabled ? "always" : "off" };
  }
  const migrated: Record<string, unknown> = { ...raw, schemaVersion: 2, capabilities, profiles: raw.profiles ?? [] };
  delete migrated.components;
  return { target, action: "migrate", content: stringify(migrated, { lineWidth: 100 }) };
}

export async function applyUserConfigMigration(result: ConfigMigrationResult): Promise<void> {
  if (result.action !== "migrate" || !result.content) return;
  const temporary = `${result.target}.orditra-${process.pid}.tmp`;
  await writeFile(temporary, result.content, { encoding: "utf8", mode: 0o600 });
  await rename(temporary, result.target);
}
