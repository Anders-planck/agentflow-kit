import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { parse } from "yaml";

import { resolveCapabilities } from "./capabilities.js";
import { pathExists } from "./paths.js";
import { loadPreset, loadSkillSources } from "./registry.js";
import type { Finding } from "./types.js";
import { loadUserConfig } from "./user-config.js";

export async function explainConfiguration(home: string, root: string, presetOverride?: string): Promise<Finding[]> {
  const config = await loadUserConfig(home, root);
  const preset = await loadPreset(root, presetOverride ?? config.preset ?? "recommended");
  const resolved = await resolveCapabilities(root, preset, config);
  return Object.entries(resolved.selections).map(([name, selection]) => {
    const definition = resolved.definitions[name];
    const provider = selection.provider ? resolved.providers[selection.provider] : undefined;
    return {
      id: name,
      capability: "configuration",
      status: selection.mode === "off" ? "info" : provider?.risk === "high" ? "warning" : "pass",
      summary: `${name}: ${selection.mode} via ${selection.provider ?? definition?.defaultProvider ?? "none"}`,
      evidence: [definition?.description ?? "No capability description", `risk=${provider?.risk ?? definition?.risk ?? "unknown"}`],
      ...(provider?.authenticated ? { remediation: "This provider requires explicit authentication before use." } : {}),
    } satisfies Finding;
  });
}

export interface SkillExplanation {
  name: string;
  source: "bundled" | "installed" | "external-lock";
  path?: string;
  description?: string;
  activeScopes: string[];
  provenance?: string;
}

async function metadata(path: string): Promise<{ name?: string; description?: string }> {
  const content = await readFile(path, "utf8");
  const match = content.match(/^---\n([\s\S]*?)\n---\n/);
  return match?.[1] ? parse(match[1]) as { name?: string; description?: string } : {};
}

export async function explainSkill(name: string, home: string, root: string): Promise<SkillExplanation> {
  const bundled = join(root, "skills", name, "SKILL.md");
  const installed = [join(home, ".agents", "skills", name, "SKILL.md"), join(home, ".claude", "skills", name, "SKILL.md")];
  const activeScopes = installed.filter(pathExists).map((path) => path.includes(".claude") ? "claude-user" : "agents-user");
  if (pathExists(bundled)) {
    const data = await metadata(bundled);
    return { name, source: "bundled", path: bundled, ...(data.description ? { description: data.description } : {}), activeScopes };
  }
  const installedPath = installed.find(pathExists);
  if (installedPath) {
    const data = await metadata(installedPath);
    return { name, source: "installed", path: installedPath, ...(data.description ? { description: data.description } : {}), activeScopes };
  }
  const sources = await loadSkillSources(root);
  for (const [sourceName, source] of Object.entries(sources.sources)) {
    const path = Object.values(source.sets).flat().find((candidate) => candidate.split("/").at(-1) === name);
    if (path) return { name, source: "external-lock", activeScopes, provenance: `${sourceName}@${source.commit}:${path}` };
  }
  throw new Error(`Unknown skill: ${name}`);
}
