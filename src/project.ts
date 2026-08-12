import { cp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";

import { parse, stringify } from "yaml";

import { pathExists } from "./paths.js";
import { directoryDigest, unique } from "./planning/shared.js";
import { loadProfiles, validateSchema } from "./registry.js";
import type { CapabilitySelection } from "./types.js";

export interface ProjectDetection {
  signals: string[];
  profiles: string[];
  skills: string[];
  capabilities: Record<string, CapabilitySelection>;
  fileCount: number;
}

export interface ProjectInitResult {
  target: string;
  action: "create" | "preserve";
  content?: string;
}

export interface ProjectSkillAction {
  name: string;
  source: string;
  target: string;
  action: "create" | "unchanged" | "preserve";
}

export interface ProjectSyncResult {
  target: string;
  action: "create" | "update" | "unchanged";
  content: string;
  detection: ProjectDetection;
  skills: ProjectSkillAction[];
}

async function walkSignals(root: string): Promise<{ extensions: Set<string>; fileCount: number; docs: number }> {
  const extensions = new Set<string>();
  let fileCount = 0;
  let docs = 0;
  async function visit(directory: string, depth: number): Promise<void> {
    if (depth > 8 || fileCount > 5000) return;
    let entries;
    try { entries = await readdir(directory, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if ([".git", ".agents", ".agentflow", ".claude", ".orditra", "node_modules", "dist", "build", ".next", "coverage", ".venv"].includes(entry.name)) continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visit(path, depth + 1);
      else if (entry.isFile()) {
        fileCount += 1;
        const extension = extname(entry.name).toLowerCase();
        if (extension) extensions.add(extension);
        if ([".md", ".mdx"].includes(extension)) docs += 1;
      }
    }
  }
  await visit(root, 0);
  return { extensions, fileCount, docs };
}

async function packageSignals(root: string): Promise<Set<string>> {
  const signals = new Set<string>();
  try {
    const value = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    const names = new Set([...Object.keys(value.dependencies ?? {}), ...Object.keys(value.devDependencies ?? {})]);
    if (["react", "next", "vite", "vue", "svelte", "@angular/core"].some((name) => names.has(name))) signals.add("web");
    if (["@playwright/test", "playwright"].some((name) => names.has(name))) signals.add("web");
    signals.add("javascript");
  } catch { /* Not a Node project. */ }
  return signals;
}

export async function detectProject(directory: string, toolkitRoot: string, explicitProfiles: string[] = []): Promise<ProjectDetection> {
  const root = resolve(directory);
  const signals = await packageSignals(root);
  const scan = await walkSignals(root);
  if ([".ts", ".tsx"].some((extension) => scan.extensions.has(extension))) signals.add("typescript");
  if ([".js", ".jsx", ".mjs", ".cjs"].some((extension) => scan.extensions.has(extension))) signals.add("javascript");
  if ([".html", ".css", ".tsx", ".jsx", ".vue", ".svelte"].some((extension) => scan.extensions.has(extension))) signals.add("web");
  if (scan.fileCount >= 500) signals.add("large-repository");
  if (scan.docs >= 50) signals.add("large-docs");
  if (pathExists(join(root, "package-lock.json")) || pathExists(join(root, "pnpm-lock.yaml")) || pathExists(join(root, "yarn.lock")) || pathExists(join(root, "go.sum")) || pathExists(join(root, "Cargo.lock"))) signals.add("lockfile");
  if (pathExists(join(root, ".github", "workflows"))) signals.add("github-actions");

  const profiles = await loadProfiles(toolkitRoot);
  const unknownProfiles = explicitProfiles.filter((name) => !profiles[name]);
  if (unknownProfiles.length) throw new Error(`Unknown project profiles: ${unknownProfiles.join(", ")}`);
  const selected = Object.values(profiles).filter((profile) => explicitProfiles.includes(profile.name) || profile.detects?.some((signal) => signals.has(signal)));
  const skills = unique([
    "workflow-router",
    "verification-gate",
    "current-docs",
    "evidence-report",
    ...selected.flatMap((profile) => profile.skills ?? []),
    ...(signals.has("typescript") || signals.has("javascript") ? ["serena-symbolic-code", "structural-code-search"] : []),
  ]).sort();
  const capabilities = Object.assign({}, ...selected.map((profile) => profile.capabilities)) as Record<string, CapabilitySelection>;
  return { signals: [...signals].sort(), profiles: selected.map((profile) => profile.name).sort(), skills, capabilities, fileCount: scan.fileCount };
}

function projectConfig(detection?: ProjectDetection): string {
  return stringify({
    schemaVersion: 2,
    profiles: detection?.profiles ?? ["auto"],
    issueTracker: "local",
    triageLabels: [],
    domainDocs: { context: "CONTEXT.md", adrDirectory: "docs/adr" },
    capabilities: {
      "semantic-code": { mode: "auto" },
      "structural-search": { mode: "auto" },
      "repository-map": { mode: "auto" },
      ...(detection?.capabilities ?? {}),
    },
    ...(detection ? { detected: detection } : {}),
  }, { lineWidth: 100 });
}

export async function planProjectInit(directory: string): Promise<ProjectInitResult> {
  const root = resolve(directory);
  const target = join(root, ".orditra", "project.yaml");
  if (pathExists(target)) return { target, action: "preserve" };
  const legacyTarget = join(root, ".agentflow", "project.yaml");
  if (pathExists(legacyTarget)) return { target: legacyTarget, action: "preserve" };
  return { target, action: "create", content: projectConfig() };
}

export async function applyProjectInit(result: ProjectInitResult): Promise<void> {
  if (result.action !== "create" || !result.content) return;
  await mkdir(dirname(result.target), { recursive: true });
  await writeFile(result.target, result.content, { encoding: "utf8", flag: "wx" });
  await readFile(result.target, "utf8");
}

export async function planProjectSync(directory: string, toolkitRoot: string, explicitProfiles: string[] = []): Promise<ProjectSyncResult> {
  const root = resolve(directory);
  const target = join(root, ".orditra", "project.yaml");
  const detection = await detectProject(root, toolkitRoot, explicitProfiles);
  const content = projectConfig(detection);
  await validateSchema(toolkitRoot, "project", parse(content) as unknown, ".orditra/project.yaml");
  let current = "";
  try { current = await readFile(target, "utf8"); } catch { /* New marker. */ }
  const skills: ProjectSkillAction[] = [];
  for (const name of detection.skills) {
    const source = join(toolkitRoot, "skills", name);
    const skillTarget = join(root, ".agents", "skills", name);
    if (!pathExists(source)) throw new Error(`Project profile references missing skill: ${name}`);
    if (!pathExists(skillTarget)) skills.push({ name, source, target: skillTarget, action: "create" });
    else if ((await directoryDigest(source)) === (await directoryDigest(skillTarget))) skills.push({ name, source, target: skillTarget, action: "unchanged" });
    else skills.push({ name, source, target: skillTarget, action: "preserve" });
  }
  return { target, action: !current ? "create" : current === content ? "unchanged" : "update", content, detection, skills };
}

export async function applyProjectSync(plan: ProjectSyncResult): Promise<void> {
  if (plan.action !== "unchanged") {
    await mkdir(dirname(plan.target), { recursive: true });
    await writeFile(plan.target, plan.content, "utf8");
  }
  for (const skill of plan.skills) {
    if (skill.action !== "create") continue;
    await mkdir(dirname(skill.target), { recursive: true });
    await cp(skill.source, skill.target, { recursive: true, preserveTimestamps: true, errorOnExist: true });
  }
}
