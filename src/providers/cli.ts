import { findExecutable } from "../commands.js";
import { capabilityIsActive } from "../capabilities.js";
import type { CapabilitySelection, PlanItem, ProviderDefinition } from "../types.js";

const EXECUTABLE_ALIASES: Record<string, string[]> = {
  "ast-grep": ["sg", "ast-grep"],
};

export function planCliProviderNotices(
  items: PlanItem[],
  capabilities: Record<string, CapabilitySelection>,
  providers: Record<string, ProviderDefinition>,
  assumedExecutables: string[] = [],
): void {
  for (const [capability, selection] of Object.entries(capabilities)) {
    if (!capabilityIsActive(selection) || !selection.provider) continue;
    const provider = providers[selection.provider];
    if (!provider || provider.kind !== "cli" || !provider.executable) continue;
    const candidates = EXECUTABLE_ALIASES[selection.provider] ?? [provider.executable];
    if (candidates.some((name) => findExecutable(name) || assumedExecutables.includes(name))) continue;
    items.push({
      kind: "notice",
      id: `provider-${selection.provider}-missing`,
      description: `${provider.description} is active for ${capability}, but ${candidates.join(" or ")} is not on PATH`,
      level: provider.risk === "high" ? "warn" : "info",
    });
  }
}
