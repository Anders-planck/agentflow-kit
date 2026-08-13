import { findExecutable, runCommand } from "./commands.js";
import { capabilityIsActive, resolveCapabilities } from "./capabilities.js";
import { loadDependencyRegistry, loadPreset } from "./registry.js";
import type { DependencyDefinition, DependencyPlanItem, GlobalOptions, ProgressCallback } from "./types.js";
import { loadUserConfig } from "./user-config.js";

export interface DependencyPlan {
  items: DependencyPlanItem[];
}

interface RuntimeSelection {
  platform?: NodeJS.Platform;
  pathValue?: string;
  assumedExecutables?: string[];
}

export function selectDependencyInstaller(
  definition: DependencyDefinition,
  runtime: RuntimeSelection = {},
): { command: string; args: string[] } | undefined {
  const platform = runtime.platform ?? process.platform;
  const pathValue = runtime.pathValue ?? process.env.PATH ?? "";
  const assumed = new Set(runtime.assumedExecutables ?? []);
  for (const installer of definition.installers) {
    if (installer.platforms && !installer.platforms.includes(platform)) continue;
    const required = findExecutable(installer.requires, pathValue) ?? (assumed.has(installer.requires) ? installer.requires : null);
    if (!required) continue;
    const command = installer.command === installer.requires
      ? required
      : findExecutable(installer.command, pathValue) ?? (assumed.has(installer.command) ? installer.command : null);
    if (command) return { command, args: installer.args };
  }
  return undefined;
}

export async function planDependencies(
  options: GlobalOptions,
  runtime: RuntimeSelection = {},
): Promise<DependencyPlan> {
  const config = await loadUserConfig(options.home, options.root);
  const preset = await loadPreset(options.root, options.preset ?? config.preset ?? "recommended");
  const resolved = await resolveCapabilities(options.root, preset, config);
  const registry = await loadDependencyRegistry(options.root);
  const active = new Set(Object.entries(resolved.selections)
    .filter(([name, selection]) => capabilityIsActive(selection) && !(name === "external-skills" && options.skipExternal))
    .map(([name]) => name));
  const pathValue = runtime.pathValue ?? process.env.PATH ?? "";
  const assumed = new Set<string>();
  const items = Object.entries(registry.dependencies).flatMap(([name, definition]): DependencyPlanItem[] => {
    const requiredBy = definition.requiredBy.filter((capability) => active.has(capability));
    if (!requiredBy.length) return [];
    if (definition.satisfiedBy.some((executable) => findExecutable(executable, pathValue))) {
      return [{
        name,
        description: definition.description,
        source: definition.source,
        ...(definition.version ? { version: definition.version } : {}),
        ...(definition.commit ? { commit: definition.commit } : {}),
        requiredBy,
        satisfiedBy: definition.satisfiedBy,
        status: "satisfied",
      }];
    }
    const spec = selectDependencyInstaller(definition, { ...runtime, assumedExecutables: [...assumed] });
    if (spec) for (const executable of definition.satisfiedBy) assumed.add(executable);
    return [{
      name,
      description: definition.description,
      source: definition.source,
      ...(definition.version ? { version: definition.version } : {}),
      ...(definition.commit ? { commit: definition.commit } : {}),
      requiredBy,
      satisfiedBy: definition.satisfiedBy,
      status: spec ? "missing" : "unresolved",
      ...(spec ? { spec } : {}),
    }];
  });
  return { items };
}

export function assumedDependencyExecutables(plan: DependencyPlan): string[] {
  return [...new Set(plan.items.filter((item) => item.status === "missing").flatMap((item) => item.satisfiedBy))];
}

export function applyDependencies(plan: DependencyPlan, onProgress?: ProgressCallback): void {
  const unresolved = plan.items.filter((item) => item.status === "unresolved");
  if (unresolved.length) {
    throw new Error(`No safe installer is available for required dependencies: ${unresolved.map((item) => item.name).join(", ")}`);
  }
  const installable = plan.items.filter((item) => item.status === "missing" && item.spec);
  for (const [index, item] of installable.entries()) {
    onProgress?.(index, installable.length, `Installing ${item.name}`);
    runCommand(item.spec!);
    onProgress?.(index + 1, installable.length, `Installed ${item.name}`);
  }
}
