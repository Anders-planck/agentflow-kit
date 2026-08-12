import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { pathExists } from "./paths.js";

const PROJECT_CONFIG = `schemaVersion: 1
issueTracker: local
triageLabels: []
domainDocs:
  context: CONTEXT.md
  adrDirectory: docs/adr
serena:
  onboarding: auto
astGrep:
  enabled: auto
`;

export interface ProjectInitResult {
  target: string;
  action: "create" | "preserve";
  content?: string;
}

export async function planProjectInit(directory: string): Promise<ProjectInitResult> {
  const root = resolve(directory);
  const target = join(root, ".agentflow", "project.yaml");
  if (pathExists(target)) return { target, action: "preserve" };
  return { target, action: "create", content: PROJECT_CONFIG };
}

export async function applyProjectInit(result: ProjectInitResult): Promise<void> {
  if (result.action !== "create" || !result.content) return;
  await mkdir(dirname(result.target), { recursive: true });
  await writeFile(result.target, result.content, { encoding: "utf8", flag: "wx" });
  await readFile(result.target, "utf8");
}
