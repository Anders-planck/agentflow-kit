import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { parse } from "yaml";

import { resolveAppPaths } from "./paths.js";
import type { ClientName, Components, UserConfig } from "./types.js";

const CLIENTS = new Set<ClientName>(["codex", "claude", "opencode"]);
const COMPONENTS = new Set<keyof Components>([
  "policies",
  "bundledSkills",
  "externalSkills",
  "contextMode",
  "serena",
  "astGrep",
]);

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
  const allowed = new Set(["schemaVersion", "preset", "clients", "components", "externalSkillSets"]);
  const unknown = Object.keys(config).filter((key) => !allowed.has(key));
  if (unknown.length) throw new Error(`Unknown user configuration keys: ${unknown.join(", ")}`);
  if (config.schemaVersion !== undefined && config.schemaVersion !== 1) throw new Error("User configuration schemaVersion must be 1");
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

  return {
    schemaVersion: 1,
    ...(config.preset !== undefined ? { preset: config.preset } : {}),
    ...(clients !== undefined ? { clients: clients as "auto" | ClientName[] } : {}),
    ...(components !== undefined ? { components: components as Partial<Components> } : {}),
    ...(skillSets !== undefined ? { externalSkillSets: skillSets as string[] } : {}),
  };
}

export async function loadUserConfig(home: string): Promise<UserConfig> {
  const directory = resolveAppPaths(home).appConfigDir;
  const [shared, local] = await Promise.all([
    readOptionalYaml(join(directory, "config.yaml")),
    readOptionalYaml(join(directory, "config.local.yaml")),
  ]);
  const merged: Record<string, unknown> = {
    ...shared,
    ...local,
    components: {
      ...((shared.components as Record<string, unknown> | undefined) ?? {}),
      ...((local.components as Record<string, unknown> | undefined) ?? {}),
    },
  };
  if (!Object.keys(merged.components as Record<string, unknown>).length) delete merged.components;
  return validate(merged);
}
