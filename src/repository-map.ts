import { readFile, readdir } from "node:fs/promises";
import { extname, join, relative } from "node:path";

import type { Finding } from "./types.js";

const CODE_EXTENSIONS = new Set([".c", ".cc", ".cpp", ".cs", ".go", ".java", ".js", ".jsx", ".kt", ".php", ".py", ".rb", ".rs", ".swift", ".ts", ".tsx", ".vue", ".svelte"]);
const SKIP = new Set([".git", "node_modules", "dist", "build", ".next", "coverage", ".venv", "vendor"]);

export interface RepositoryMap {
  root: string;
  budget: number;
  totalFiles: number;
  estimatedTokens: number;
  files: Array<{ path: string; bytes: number; estimatedTokens: number }>;
  findings: Finding[];
}

export async function buildRepositoryMap(root: string, budget = 2000): Promise<RepositoryMap> {
  const files: Array<{ path: string; bytes: number; estimatedTokens: number }> = [];
  async function visit(directory: string): Promise<void> {
    let entries;
    try { entries = await readdir(directory, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (SKIP.has(entry.name)) continue;
      const absolute = join(directory, entry.name);
      if (entry.isDirectory()) await visit(absolute);
      else if (entry.isFile() && CODE_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
        const content = await readFile(absolute);
        files.push({ path: relative(root, absolute), bytes: content.byteLength, estimatedTokens: Math.ceil(content.byteLength / 4) });
      }
    }
  }
  await visit(root);
  files.sort((a, b) => b.estimatedTokens - a.estimatedTokens || a.path.localeCompare(b.path));
  const estimatedTokens = files.reduce((total, file) => total + file.estimatedTokens, 0);
  const selected: typeof files = [];
  let used = 0;
  for (const file of files) {
    if (selected.length && used + file.estimatedTokens > budget) continue;
    selected.push(file);
    used += file.estimatedTokens;
    if (used >= budget) break;
  }
  const findings: Finding[] = [
    { id: "repository-size", capability: "repository-map", status: "info", summary: `${files.length} code files, approximately ${estimatedTokens} tokens` },
    { id: "repository-budget", capability: "repository-map", status: used <= budget ? "pass" : "warning", summary: `${selected.length} highest-information files fit the ${budget}-token map budget`, evidence: selected.map((file) => `${file.path}: ~${file.estimatedTokens} tokens`) },
  ];
  return { root, budget, totalFiles: files.length, estimatedTokens, files: selected, findings };
}
