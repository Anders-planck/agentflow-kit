import { componentsFromCapabilities, loadCapabilityRegistry, loadProfiles, loadProviderRegistry } from "./registry.js";
import type {
  CapabilityDefinition,
  CapabilitySelection,
  Components,
  Preset,
  ProfileDefinition,
  ProviderDefinition,
  UserConfig,
} from "./types.js";

const COMPONENT_CAPABILITIES: Record<keyof Components, string> = {
  policies: "policies",
  bundledSkills: "workflow-core",
  externalSkills: "external-skills",
  contextMode: "context-protection",
  serena: "semantic-code",
  astGrep: "structural-search",
};

export interface ResolvedCapabilities {
  selections: Record<string, CapabilitySelection>;
  definitions: Record<string, CapabilityDefinition>;
  providers: Record<string, ProviderDefinition>;
  profiles: ProfileDefinition[];
  components: Components;
}

function mergeSelection(base: CapabilitySelection | undefined, override: CapabilitySelection): CapabilitySelection {
  const provider = override.provider ?? base?.provider;
  const options = base?.options || override.options ? { ...(base?.options ?? {}), ...(override.options ?? {}) } : undefined;
  return {
    mode: override.mode,
    ...(provider ? { provider } : {}),
    ...(options ? { options } : {}),
  };
}

export async function resolveCapabilities(root: string, preset: Preset, userConfig: UserConfig): Promise<ResolvedCapabilities> {
  const [capabilityRegistry, providerRegistry, profileRegistry] = await Promise.all([
    loadCapabilityRegistry(root),
    loadProviderRegistry(root),
    loadProfiles(root),
  ]);
  const selections: Record<string, CapabilitySelection> = {};
  for (const [name, definition] of Object.entries(capabilityRegistry.capabilities)) {
    selections[name] = { mode: definition.defaultMode, provider: definition.defaultProvider };
  }
  for (const [name, selection] of Object.entries(preset.capabilities)) {
    if (!capabilityRegistry.capabilities[name]) throw new Error(`Unknown preset capability: ${name}`);
    selections[name] = mergeSelection(selections[name], selection);
  }

  const profiles: ProfileDefinition[] = [];
  for (const name of userConfig.profiles ?? []) {
    const profile = profileRegistry[name];
    if (!profile) throw new Error(`Unknown capability profile: ${name}`);
    profiles.push(profile);
    for (const [capability, selection] of Object.entries(profile.capabilities)) {
      if (!capabilityRegistry.capabilities[capability]) throw new Error(`Unknown capability in profile ${name}: ${capability}`);
      selections[capability] = mergeSelection(selections[capability], selection);
    }
  }

  for (const [name, selection] of Object.entries(userConfig.capabilities ?? {})) {
    if (!capabilityRegistry.capabilities[name]) throw new Error(`Unknown user capability: ${name}`);
    selections[name] = mergeSelection(selections[name], selection);
  }
  for (const [component, value] of Object.entries(userConfig.components ?? {})) {
    const capability = COMPONENT_CAPABILITIES[component as keyof Components];
    if (capability) selections[capability] = mergeSelection(selections[capability], { mode: value ? "always" : "off" });
  }

  for (const [name, selection] of Object.entries(selections)) {
    const definition = capabilityRegistry.capabilities[name];
    if (!definition) continue;
    const provider = selection.provider ?? definition.defaultProvider;
    if (!providerRegistry.providers[provider]) throw new Error(`Capability ${name} references unknown provider ${provider}`);
    selections[name] = { ...selection, provider };
  }
  for (const [name, selection] of Object.entries(selections)) {
    if (selection.mode === "off" || selection.mode === "registered") continue;
    for (const conflict of capabilityRegistry.capabilities[name]?.conflicts ?? []) {
      const other = selections[conflict];
      if (other && other.mode !== "off" && other.mode !== "registered") {
        throw new Error(`Capability conflict: ${name} and ${conflict} cannot both be active`);
      }
    }
  }

  return {
    selections,
    definitions: capabilityRegistry.capabilities,
    providers: providerRegistry.providers,
    profiles,
    components: componentsFromCapabilities(selections),
  };
}

export function capabilityIsActive(selection: CapabilitySelection | undefined): boolean {
  return selection?.mode === "always" || selection?.mode === "auto";
}

export function capabilityIsAvailable(selection: CapabilitySelection | undefined): boolean {
  return Boolean(selection && selection.mode !== "off");
}
