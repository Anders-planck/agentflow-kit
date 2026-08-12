import type { Command } from "commander";

import { formatCommand } from "../commands.js";
import { applyDependencies, assumedDependencyExecutables, planDependencies } from "../dependencies.js";
import { applyPlan } from "../executor.js";
import { buildInstallPlan } from "../planner.js";
import type { GlobalOptions } from "../types.js";
import { globalOptions } from "./options.js";
import { confirm, printPlan } from "./output.js";

async function install(options: GlobalOptions): Promise<void> {
  const dependencyPlan = await planDependencies(options);
  const pendingDependencies = dependencyPlan.items.filter((item) => item.status !== "satisfied");
  if (!options.json && pendingDependencies.length) {
    console.log("Required dependencies:");
    for (const item of pendingDependencies) {
      console.log(`${item.status === "missing" ? "INSTALL" : "MANUAL ".padEnd(7)} ${item.name} — ${item.description}`);
      console.log(`        ${item.source}${item.version ? ` @ ${item.version}` : item.commit ? ` @ ${item.commit}` : ""}`);
      if (item.spec) console.log(`        ${formatCommand(item.spec)}`);
    }
  }

  let assumedExecutables: string[] = [];
  if (pendingDependencies.length && !options.skipDependencies) {
    if (options.dryRun) assumedExecutables = assumedDependencyExecutables(dependencyPlan);
    else {
      const unresolved = pendingDependencies.filter((item) => item.status === "unresolved");
      if (unresolved.length) {
        throw new Error(`No safe installer is available for required dependencies: ${unresolved.map((item) => item.name).join(", ")}. Install them manually or pass --skip-dependencies to inspect the remaining plan.`);
      }
      if (!options.yes && !(await confirm("Install the missing required dependencies? [y/N] "))) {
        throw new Error("Dependency installation cancelled; pass --yes to approve or --skip-dependencies to continue without it");
      }
      applyDependencies(dependencyPlan);
      const remaining = (await planDependencies(options)).items.filter((item) => item.status !== "satisfied");
      if (remaining.length) throw new Error(`Required dependencies are still unavailable after installation: ${remaining.map((item) => item.name).join(", ")}`);
    }
  }

  const plan = await buildInstallPlan({ ...options, assumedExecutables });
  plan.dependencies = dependencyPlan.items;
  printPlan(plan, options.json);
  if (options.dryRun || !plan.items.some((item) => item.kind !== "notice")) return;
  if (!options.yes && !(await confirm("Apply this configuration plan? [y/N] "))) throw new Error("Installation cancelled; pass --yes for non-interactive apply");
  const manifest = await applyPlan(plan, options);
  if (!options.json) console.log(manifest ? `Applied with backup: ${manifest.backupDir}` : "No changes applied.");
}

export function registerInstallCommands(program: Command): void {
  program.command("install").description("preview and apply the selected capability preset").action(async () => install(globalOptions(program)));
  program.command("update").description("reconcile the selected preset with the installed release").action(async () => install(globalOptions(program)));
  program.command("diff").description("preview changes without writing").action(async () => install(globalOptions(program, { dryRun: true })));
}
