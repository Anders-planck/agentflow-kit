import { createInterface } from "node:readline/promises";

import { formatCommand } from "../commands.js";
import { outputFindings } from "../reporting.js";
import type { Finding, GlobalOptions, InstallPlan, PlanItem } from "../types.js";

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
  console.log(`Preset: ${plan.preset.name}`);
  console.log(`Clients: ${Object.entries(plan.clients).filter(([, enabled]) => enabled).map(([name]) => name).join(", ") || "none"}`);
  console.log(`Active capabilities: ${Object.entries(plan.capabilities).filter(([, value]) => value.mode === "always" || value.mode === "auto").map(([name]) => name).join(", ") || "none"}`);
  if (!plan.items.length) console.log("No changes required.");
  for (const item of plan.items) console.log(itemSummary(item));
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
