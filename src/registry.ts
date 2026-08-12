import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { parse } from "yaml";

import type { Preset, SkillSourcesRegistry, ToolRegistry } from "./types.js";

async function loadYaml<T>(path: string): Promise<T> {
  const value = parse(await readFile(path, "utf8")) as T;
  if (!value || typeof value !== "object") throw new Error(`Invalid YAML object: ${path}`);
  return value;
}

export async function loadPreset(root: string, name: string): Promise<Preset> {
  const preset = await loadYaml<Preset>(join(root, "presets", `${name}.yaml`));
  if (preset.schemaVersion !== 1 || preset.name !== name || !preset.components) {
    throw new Error(`Invalid preset: ${name}`);
  }
  return preset;
}

export async function loadToolRegistry(root: string): Promise<ToolRegistry> {
  const registry = await loadYaml<ToolRegistry>(join(root, "registry", "tools.yaml"));
  if (registry.schemaVersion !== 1 || !registry.tools) throw new Error("Invalid tool registry");
  return registry;
}

export async function loadSkillSources(root: string): Promise<SkillSourcesRegistry> {
  const registry = await loadYaml<SkillSourcesRegistry>(join(root, "registry", "skill-sources.lock.yaml"));
  if (registry.schemaVersion !== 1 || !registry.sources) throw new Error("Invalid skill source lock");
  return registry;
}

export async function packageVersion(root: string): Promise<string> {
  const parsed = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as { version?: string };
  if (!parsed.version) throw new Error("package.json has no version");
  return parsed.version;
}

