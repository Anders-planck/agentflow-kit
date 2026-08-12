import { readFile, readdir } from "node:fs/promises";
import { basename, join } from "node:path";

import { parse } from "yaml";

export interface ValidationIssue {
  level: "warn" | "error";
  path: string;
  message: string;
}

async function walk(root: string): Promise<string[]> {
  const files: string[] = [];
  async function visit(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if ([".git", "node_modules", "dist", "local-state"].includes(entry.name)) continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile()) files.push(path);
    }
  }
  await visit(root);
  return files;
}

function frontmatter(content: string): Record<string, unknown> | null {
  const match = content.match(/^---\n([\s\S]*?)\n---\n/);
  return match?.[1] ? parse(match[1]) as Record<string, unknown> : null;
}

export async function validateRepository(root: string): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = [];
  const files = await walk(root);
  for (const path of files.filter((file) => /\.(ya?ml)$/.test(file))) {
    try { parse(await readFile(path, "utf8")); } catch (error) {
      issues.push({ level: "error", path, message: `Invalid YAML: ${(error as Error).message}` });
    }
  }
  for (const path of files.filter((file) => basename(file) === "SKILL.md")) {
    const content = await readFile(path, "utf8");
    const metadata = frontmatter(content);
    const name = metadata?.name;
    const description = metadata?.description;
    if (!metadata) issues.push({ level: "error", path, message: "Missing YAML frontmatter" });
    if (typeof name !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name) || name.length > 64) issues.push({ level: "error", path, message: "Invalid skill name" });
    if (typeof description !== "string" || description.length === 0 || description.length > 1024 || !/Use (for|when)\b/i.test(description)) issues.push({ level: "error", path, message: "Description must explain what the skill does and when to use it" });
    if (content.split("\n").length > 100) issues.push({ level: "warn", path, message: "SKILL.md exceeds the 100-line authoring target" });
  }

  const textFiles = files.filter((file) => /\.(md|json|ya?ml|toml|ts|js|mjs)$/.test(file));
  const secretPatterns: Array<[RegExp, string]> = [
    [/AKIA[0-9A-Z]{16}/, "AWS access key"],
    [/gh[pousr]_[A-Za-z0-9_]{30,}/, "GitHub token"],
    [/sk-[A-Za-z0-9]{32,}/, "API secret"],
    [/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, "private key"],
  ];
  for (const path of textFiles) {
    const content = await readFile(path, "utf8");
    if (/\/Users\/[^/<\s]+/.test(content)) issues.push({ level: "error", path, message: "Personal macOS home path found" });
    for (const [pattern, label] of secretPatterns) if (pattern.test(content)) issues.push({ level: "error", path, message: `${label} pattern found` });
  }

  const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as { repository?: { url?: string } };
  if (packageJson.repository?.url?.includes("OWNER")) issues.push({ level: "warn", path: join(root, "package.json"), message: "Replace the GitHub OWNER placeholder before publishing" });

  const sourceRegistry = parse(await readFile(join(root, "registry", "skill-sources.lock.yaml"), "utf8")) as {
    sources?: Record<string, { commit?: string; license?: string; sets?: Record<string, string[]> }>;
  };
  const externalNames = new Set<string>();
  const availableSets = new Set<string>();
  for (const [sourceName, source] of Object.entries(sourceRegistry.sources ?? {})) {
    if (!/^[a-f0-9]{40}$/.test(source.commit ?? "")) issues.push({ level: "error", path: "registry/skill-sources.lock.yaml", message: `${sourceName} must pin a full commit hash` });
    if (!source.license) issues.push({ level: "error", path: "registry/skill-sources.lock.yaml", message: `${sourceName} has no license metadata` });
    for (const [setName, paths] of Object.entries(source.sets ?? {})) {
      availableSets.add(setName);
      for (const path of paths) {
        if (path.startsWith("/") || path.split("/").includes("..")) issues.push({ level: "error", path: "registry/skill-sources.lock.yaml", message: `Unsafe external skill path: ${path}` });
        externalNames.add(basename(path));
      }
    }
  }
  const bundledNames = new Set(await readdir(join(root, "skills")));
  const workflows = parse(await readFile(join(root, "registry", "workflows.yaml"), "utf8")) as {
    stages?: Record<string, { routes?: Array<{ skill?: string }> }>;
  };
  for (const [stage, definition] of Object.entries(workflows.stages ?? {})) {
    if (!definition.routes?.length) issues.push({ level: "error", path: "registry/workflows.yaml", message: `Workflow stage ${stage} has no routes` });
    for (const route of definition.routes ?? []) {
      if (!route.skill || (!bundledNames.has(route.skill) && !externalNames.has(route.skill))) {
        issues.push({ level: "error", path: "registry/workflows.yaml", message: `Unknown skill route ${stage}/${route.skill ?? "missing"}` });
      }
    }
  }
  for (const presetPath of files.filter((file) => /presets\/.+\.yaml$/.test(file))) {
    const preset = parse(await readFile(presetPath, "utf8")) as { externalSkillSets?: string[] };
    for (const setName of preset.externalSkillSets ?? []) if (!availableSets.has(setName)) issues.push({ level: "error", path: presetPath, message: `Unknown external skill set: ${setName}` });
  }
  return issues;
}
