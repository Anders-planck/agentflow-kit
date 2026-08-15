import { createInterface } from "node:readline/promises";

import { isArtifactInstallSpec } from "../artifact-installer.js";
import { formatCommand } from "../commands.js";
import { outputFindings } from "../reporting.js";
import type { DependencyPlanItem, Finding, GlobalOptions, InstallPlan, PlanItem } from "../types.js";

function itemSummary(item: PlanItem): string {
  switch (item.kind) {
    case "write": return `WRITE   ${item.target} — ${item.description}`;
    case "symlink": return `LINK    ${item.target} -> ${item.source}`;
    case "copy-dir": return `COPY    ${item.source} -> ${item.target}`;
    case "external-skills": return `FETCH   ${item.sourceName}/${item.skillSet} -> ${item.target}`;
    case "command": return `RUN     ${formatCommand(item.spec)}`;
    case "notice": return `${item.level.toUpperCase().padEnd(7)} ${item.description}`;
  }
}

export function printPlan(plan: InstallPlan, json: boolean): void {
  if (json) return console.log(JSON.stringify(plan, null, 2));
  const clients = Object.entries(plan.clients).filter(([, enabled]) => enabled).map(([name]) => name);
  const active = Object.entries(plan.capabilities).filter(([, value]) => value.mode === "always" || value.mode === "auto").map(([name]) => name);
  console.log("│ Configuration plan");
  console.log(`│   Preset: ${plan.preset.name}`);
  console.log(`│   Clients: ${clients.join(", ") || "none"}`);
  console.log(`│   Active capabilities (${active.length}):`);
  for (let index = 0; index < active.length; index += 4) console.log(`│     ${active.slice(index, index + 4).join(" · ")}`);
  console.log(`│   Changes (${plan.items.length}):`);
  if (!plan.items.length) return console.log("│     No changes required.");

  const counts = new Map<string, number>();
  for (const item of plan.items) counts.set(item.kind, (counts.get(item.kind) ?? 0) + 1);
  console.log(`│     ${[...counts.entries()].map(([kind, count]) => `${kind.toUpperCase()} ${count}`).join(" · ")}`);
  const links = plan.items.filter((item) => item.kind === "symlink");
  if (links.length > 12) console.log(`│     LINK    ${links.length} managed skill links across the shared Codex and Claude roots`);
  for (const item of plan.items) {
    if (links.length > 12 && item.kind === "symlink") continue;
    console.log(`│     ${itemSummary(item)}`);
  }
  if (links.length > 12) console.log("│     Exact per-path plan remains available with --json.");
}

export function printDependencies(items: DependencyPlanItem[]): void {
  const pending = items.filter((item) => item.status !== "satisfied");
  const ready = items.length - pending.length;
  console.log(`│ Dependency requirements · ${ready}/${items.length} ready · ${pending.length} action${pending.length === 1 ? "" : "s"}`);
  for (const item of pending) {
    const action = item.status === "missing" ? "INSTALL" : "MANUAL";
    const pin = item.version ? `v${item.version}` : item.commit ? item.commit.slice(0, 12) : "upstream";
    console.log(`│   ${action.padEnd(7)} ${item.name} · ${pin}`);
    console.log(`│           ${item.description}`);
    console.log(`│           Source: ${item.source}`);
    if (item.spec && isArtifactInstallSpec(item.spec)) {
      console.log(`│           Artifact: ${item.spec.url}`);
      console.log(`│           Checksum: sha256:${item.spec.sha256}`);
      console.log(`│           Target: ${item.spec.target}`);
    } else if (item.spec) console.log(`│           Command: ${formatCommand(item.spec)}`);
    if (item.remediation) console.log(`│           Requirement: ${item.remediation}`);
  }
}

export async function confirm(question: string): Promise<boolean> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) return false;
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  try { return /^y(?:es)?$/i.test((await prompt.question(question)).trim()); }
  finally { prompt.close(); }
}

export async function emitFindings(findings: Finding[], options: GlobalOptions): Promise<void> {
  const rendered = await outputFindings(findings, options.format ?? "terminal", options.output);
  if (options.output) console.log(options.output);
  else process.stdout.write(rendered);
}
