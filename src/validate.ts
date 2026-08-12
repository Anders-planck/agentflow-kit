import { lstat, readFile, readdir, readlink } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import { parse } from "yaml";

import { loadCapabilityRegistry, loadDependencyRegistry, loadProfiles, loadProviderRegistry, loadPreset, validateSchema } from "./registry.js";

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
      else if (entry.isSymbolicLink()) files.push(path);
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
  for (const path of files) {
    const stat = await lstat(path);
    if (!stat.isSymbolicLink()) continue;
    const resolvedTarget = resolve(dirname(path), await readlink(path));
    const fromRoot = relative(resolve(root), resolvedTarget);
    if (isAbsolute(fromRoot) || fromRoot === ".." || fromRoot.startsWith(`..${sep}`)) {
      issues.push({ level: "error", path, message: "Repository symlink escapes the repository root" });
    }
  }
  for (const path of files.filter((file) => /\.(ya?ml)$/.test(file))) {
    try { parse(await readFile(path, "utf8")); } catch (error) {
      issues.push({ level: "error", path, message: `Invalid YAML: ${(error as Error).message}` });
    }
  }
  for (const path of files.filter((file) => file.endsWith(join("agents", "openai.yaml")))) {
    try {
      await validateSchema(root, "openai-skill", parse(await readFile(path, "utf8")) as unknown, relative(root, path));
    } catch (error) {
      issues.push({ level: "error", path, message: (error as Error).message });
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

  const bundledSkillMetadata = new Map<string, string>();
  for (const path of files.filter((file) => basename(file) === "SKILL.md")) {
    const metadata = frontmatter(await readFile(path, "utf8"));
    if (typeof metadata?.name !== "string") continue;
    const existing = bundledSkillMetadata.get(metadata.name);
    if (existing) issues.push({ level: "error", path, message: `Duplicate bundled skill name also used by ${existing}` });
    else bundledSkillMetadata.set(metadata.name, path);
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

  const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as { version?: string; repository?: { url?: string } };
  if (packageJson.repository?.url?.includes("OWNER")) issues.push({ level: "warn", path: join(root, "package.json"), message: "Replace the GitHub OWNER placeholder before publishing" });
  try {
    const plugin = JSON.parse(await readFile(join(root, ".codex-plugin", "plugin.json"), "utf8")) as { name?: string; version?: string; skills?: string; mcpServers?: string };
    if (plugin.name !== "orditra") issues.push({ level: "error", path: ".codex-plugin/plugin.json", message: "Plugin name must match the repository folder name" });
    if (plugin.version !== packageJson.version) issues.push({ level: "error", path: ".codex-plugin/plugin.json", message: "Plugin version must match package.json" });
    if (plugin.skills !== "./skills/") issues.push({ level: "error", path: ".codex-plugin/plugin.json", message: "Plugin must use the canonical skills directory" });
    if (plugin.mcpServers !== "./.mcp.json") issues.push({ level: "error", path: ".codex-plugin/plugin.json", message: "Plugin must use the canonical MCP manifest" });
  } catch (error) {
    issues.push({ level: "error", path: ".codex-plugin/plugin.json", message: `Invalid plugin manifest: ${(error as Error).message}` });
  }
  try {
    const path = join(root, ".agents", "plugins", "marketplace.json");
    const marketplace = JSON.parse(await readFile(path, "utf8")) as unknown;
    await validateSchema(root, "marketplace", marketplace, ".agents/plugins/marketplace.json");
  } catch (error) {
    issues.push({ level: "error", path: ".agents/plugins/marketplace.json", message: `Invalid marketplace: ${(error as Error).message}` });
  }

  const sourceRegistry = parse(await readFile(join(root, "registry", "skill-sources.lock.yaml"), "utf8")) as {
    sources?: Record<string, { commit?: string; license?: string; licenseDigest?: string; reviewedAt?: string; contentDigests?: Record<string, string>; sets?: Record<string, string[]> }>;
  };
  const externalNames = new Set<string>();
  const availableSets = new Set<string>();
  for (const [sourceName, source] of Object.entries(sourceRegistry.sources ?? {})) {
    if (!/^[a-f0-9]{40}$/.test(source.commit ?? "")) issues.push({ level: "error", path: "registry/skill-sources.lock.yaml", message: `${sourceName} must pin a full commit hash` });
    if (!source.license) issues.push({ level: "error", path: "registry/skill-sources.lock.yaml", message: `${sourceName} has no license metadata` });
    if (!/^[a-f0-9]{64}$/.test(source.licenseDigest ?? "")) issues.push({ level: "error", path: "registry/skill-sources.lock.yaml", message: `${sourceName} must pin the license digest` });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(source.reviewedAt ?? "")) issues.push({ level: "error", path: "registry/skill-sources.lock.yaml", message: `${sourceName} must record a review date` });
    for (const [setName, paths] of Object.entries(source.sets ?? {})) {
      availableSets.add(setName);
      for (const path of paths) {
        if (path.startsWith("/") || path.split("/").includes("..")) issues.push({ level: "error", path: "registry/skill-sources.lock.yaml", message: `Unsafe external skill path: ${path}` });
        if (!/^[a-f0-9]{64}$/.test(source.contentDigests?.[path] ?? "")) issues.push({ level: "error", path: "registry/skill-sources.lock.yaml", message: `Missing content digest for external skill: ${path}` });
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

  try {
    const [capabilities, providers, profiles, dependencies] = await Promise.all([
      loadCapabilityRegistry(root),
      loadProviderRegistry(root),
      loadProfiles(root),
      loadDependencyRegistry(root),
    ]);
    for (const [name, capability] of Object.entries(capabilities.capabilities)) {
      if (!providers.providers[capability.defaultProvider]) issues.push({ level: "error", path: "registry/capabilities.yaml", message: `${name} references unknown provider ${capability.defaultProvider}` });
      for (const skill of capability.skills ?? []) if (!bundledNames.has(skill)) issues.push({ level: "error", path: "registry/capabilities.yaml", message: `${name} references unknown bundled skill ${skill}` });
      for (const conflict of capability.conflicts ?? []) if (!capabilities.capabilities[conflict]) issues.push({ level: "error", path: "registry/capabilities.yaml", message: `${name} conflicts with unknown capability ${conflict}` });
    }
    for (const [name, provider] of Object.entries(providers.providers)) {
      if (/^https:\/\/github\.com\//.test(provider.source) && !/^[a-f0-9]{40}$/.test(provider.commit ?? "")) {
        issues.push({ level: "error", path: "registry/providers.yaml", message: `${name} must pin a full source commit` });
      }
      if (provider.authenticated && provider.risk !== "high") issues.push({ level: "error", path: "registry/providers.yaml", message: `${name} is authenticated and must be classified high risk` });
    }
    for (const profile of Object.values(profiles)) {
      for (const [capability, selection] of Object.entries(profile.capabilities)) {
        if (!capabilities.capabilities[capability]) issues.push({ level: "error", path: `registry/profiles/${profile.name}.yaml`, message: `Unknown capability ${capability}` });
        if (selection.provider && !providers.providers[selection.provider]) issues.push({ level: "error", path: `registry/profiles/${profile.name}.yaml`, message: `Unknown provider ${selection.provider}` });
      }
      for (const skill of profile.skills ?? []) if (!bundledNames.has(skill)) issues.push({ level: "error", path: `registry/profiles/${profile.name}.yaml`, message: `Unknown skill ${skill}` });
    }
    for (const [name, dependency] of Object.entries(dependencies.dependencies)) {
      for (const capability of dependency.requiredBy) if (!capabilities.capabilities[capability]) {
        issues.push({ level: "error", path: "registry/dependencies.yaml", message: `${name} references unknown capability ${capability}` });
      }
      if (/^https:\/\/github\.com\//.test(dependency.source) && !/^[a-f0-9]{40}$/.test(dependency.commit ?? "")) {
        issues.push({ level: "error", path: "registry/dependencies.yaml", message: `${name} must pin a full source commit` });
      }
    }
    for (const name of ["minimal", "recommended", "full"]) await loadPreset(root, name);
    for (const [file, schema] of [
      ["reporters.yaml", "reporters"],
      ["compatibility.yaml", "compatibility"],
      ["security-policy.yaml", "security-policy"],
      ["mcp.yaml", "mcp"],
      ["tools.yaml", "tools"],
      ["workflows.yaml", "workflows"],
      ["skill-sources.lock.yaml", "skill-sources"],
      ["dependencies.yaml", "dependencies"],
    ] as const) {
      const value = parse(await readFile(join(root, "registry", file), "utf8")) as unknown;
      await validateSchema(root, schema, value, `registry/${file}`);
    }
    const mcp = parse(await readFile(join(root, "registry", "mcp.yaml"), "utf8")) as { servers?: Record<string, { provider?: string }> };
    for (const [name, server] of Object.entries(mcp.servers ?? {})) {
      if (!server.provider || !providers.providers[server.provider]) {
        issues.push({ level: "error", path: "registry/mcp.yaml", message: `${name} references unknown provider ${server.provider ?? "missing"}` });
      }
    }
    const tools = parse(await readFile(join(root, "registry", "tools.yaml"), "utf8")) as { tools?: Record<string, { provider?: string }> };
    for (const [name, tool] of Object.entries(tools.tools ?? {})) {
      if (tool.provider && !providers.providers[tool.provider]) {
        issues.push({ level: "error", path: "registry/tools.yaml", message: `${name} references unknown provider ${tool.provider}` });
      }
    }
  } catch (error) {
    issues.push({ level: "error", path: "registry", message: (error as Error).message });
  }

  for (const workflowPath of files.filter((file) => /\.github\/workflows\/.+\.ya?ml$/.test(file))) {
    const content = await readFile(workflowPath, "utf8");
    for (const match of content.matchAll(/^\s*(?:-\s*)?uses:\s*([^\s#]+)(?:\s+#.*)?\s*$/gm)) {
      const reference = match[1];
      if (reference?.startsWith("./") || reference?.startsWith("docker://")) continue;
      const revision = reference?.split("@").at(-1) ?? "";
      if (!/^[a-f0-9]{40}$/.test(revision)) issues.push({ level: "error", path: workflowPath, message: `GitHub Action must use a full commit SHA: ${reference ?? "missing"}` });
    }
  }
  return issues;
}
