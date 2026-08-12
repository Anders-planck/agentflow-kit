import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

import { Ajv, type ErrorObject } from "ajv";
import { parse } from "yaml";

import type {
  CapabilityRegistry,
  CapabilitySelection,
  Components,
  DependencyRegistry,
  Preset,
  ProfileDefinition,
  ProviderRegistry,
  SkillSourcesRegistry,
  ToolRegistry,
} from "./types.js";

const ajv = new Ajv({ allErrors: true, strict: false });

async function loadYaml(path: string): Promise<unknown> {
  const value = parse(await readFile(path, "utf8")) as unknown;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Invalid YAML object: ${path}`);
  return value;
}

function validationMessage(path: string, errors: ErrorObject[] | null | undefined): string {
  const details = (errors ?? []).map((error) => `${error.instancePath || "/"} ${error.message ?? "is invalid"}`).join("; ");
  return `Schema validation failed for ${path}${details ? `: ${details}` : ""}`;
}

export async function validateSchema(root: string, schemaName: string, value: unknown, sourcePath: string): Promise<void> {
  const schema = JSON.parse(await readFile(join(root, "schemas", `${schemaName}.schema.json`), "utf8")) as object;
  const validate = ajv.compile(schema);
  if (!validate(value)) throw new Error(validationMessage(sourcePath, validate.errors));
}

async function loadValidatedYaml<T>(root: string, relativePath: string, schemaName: string): Promise<T> {
  const path = join(root, relativePath);
  const value = await loadYaml(path);
  await validateSchema(root, schemaName, value, relativePath);
  return value as T;
}

const COMPONENT_CAPABILITIES: Record<keyof Components, string> = {
  policies: "policies",
  bundledSkills: "workflow-core",
  externalSkills: "external-skills",
  contextMode: "context-protection",
  serena: "semantic-code",
  astGrep: "structural-search",
};

function enabled(selection: CapabilitySelection | undefined): boolean {
  return selection?.mode === "always" || selection?.mode === "auto";
}

export function componentsFromCapabilities(capabilities: Record<string, CapabilitySelection>): Components {
  return Object.fromEntries(
    Object.entries(COMPONENT_CAPABILITIES).map(([component, capability]) => [component, enabled(capabilities[capability])]),
  ) as unknown as Components;
}

function capabilitiesFromComponents(components: Components): Record<string, CapabilitySelection> {
  return Object.fromEntries(
    Object.entries(COMPONENT_CAPABILITIES).map(([component, capability]) => [
      capability,
      { mode: components[component as keyof Components] ? "always" : "off" },
    ]),
  );
}

interface RawPreset {
  schemaVersion: 1 | 2;
  name: string;
  description: string;
  components?: Components;
  capabilities?: Record<string, CapabilitySelection>;
  externalSkillSets?: string[];
}

export async function loadPreset(root: string, name: string): Promise<Preset> {
  const raw = await loadValidatedYaml<RawPreset>(root, join("presets", `${name}.yaml`), "preset");
  if (raw.name !== name) throw new Error(`Preset name mismatch: expected ${name}, found ${raw.name}`);
  const capabilities = raw.capabilities ?? capabilitiesFromComponents(raw.components ?? {
    policies: false,
    bundledSkills: false,
    externalSkills: false,
    contextMode: false,
    serena: false,
    astGrep: false,
  });
  return {
    schemaVersion: raw.schemaVersion,
    name: raw.name,
    description: raw.description,
    components: raw.components ?? componentsFromCapabilities(capabilities),
    capabilities,
    ...(raw.externalSkillSets ? { externalSkillSets: raw.externalSkillSets } : {}),
  };
}

export async function loadToolRegistry(root: string): Promise<ToolRegistry> {
  const registry = await loadYaml(join(root, "registry", "tools.yaml")) as ToolRegistry;
  if (![1, 2].includes(registry.schemaVersion) || !registry.tools) throw new Error("Invalid tool registry");
  return registry;
}

export async function loadCapabilityRegistry(root: string): Promise<CapabilityRegistry> {
  return loadValidatedYaml<CapabilityRegistry>(root, join("registry", "capabilities.yaml"), "capabilities");
}

export async function loadProviderRegistry(root: string): Promise<ProviderRegistry> {
  return loadValidatedYaml<ProviderRegistry>(root, join("registry", "providers.yaml"), "providers");
}

export async function loadDependencyRegistry(root: string): Promise<DependencyRegistry> {
  return loadValidatedYaml<DependencyRegistry>(root, join("registry", "dependencies.yaml"), "dependencies");
}

export async function loadProfiles(root: string): Promise<Record<string, ProfileDefinition>> {
  const directory = join(root, "registry", "profiles");
  const names = (await readdir(directory)).filter((name) => name.endsWith(".yaml")).sort();
  const profiles = await Promise.all(names.map(async (file) => {
    const profile = await loadValidatedYaml<ProfileDefinition>(root, join("registry", "profiles", file), "profile");
    return [profile.name, profile] as const;
  }));
  return Object.fromEntries(profiles);
}

export async function loadSkillSources(root: string): Promise<SkillSourcesRegistry> {
  const registry = await loadYaml(join(root, "registry", "skill-sources.lock.yaml")) as SkillSourcesRegistry;
  if (registry.schemaVersion !== 1 || !registry.sources) throw new Error("Invalid skill source lock");
  return registry;
}

export async function packageVersion(root: string): Promise<string> {
  const parsed = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as { version?: string };
  if (!parsed.version) throw new Error("package.json has no version");
  return parsed.version;
}
