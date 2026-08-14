import type { Command } from "commander";

import { applyDependencies, assumedDependencyExecutables, planDependencies } from "../dependencies.js";
import { applyPlan } from "../executor.js";
import { buildInstallPlan } from "../planner.js";
import type { GlobalOptions } from "../types.js";
import { ensureAgentScanToken } from "./credentials.js";
import { globalOptions } from "./options.js";
import { confirm, printDependencies, printPlan } from "./output.js";
import { createProgressFlow, markCliErrorReported } from "./progress.js";

async function install(options: GlobalOptions, operation: "Install" | "Update" | "Diff"): Promise<void> {
  const progress = createProgressFlow(operation, !options.json);
  progress.start(options.preset ? `Requested preset: ${options.preset}` : "Using the configured preset");
  try {
    progress.stage("1/4 · Preflight and dependency inventory");
    const dependencyPlan = await planDependencies(options);
    const pendingDependencies = dependencyPlan.items.filter((item) => item.status !== "satisfied");
    if (!options.json) printDependencies(dependencyPlan.items);

    if (!options.dryRun && dependencyPlan.items.some((item) => item.name === "agent-scan")) {
      await ensureAgentScanToken({
        interactive: !options.json && Boolean(process.stdin.isTTY && process.stdout.isTTY),
        write: (message) => progress.info(message),
      });
    }

    let assumedExecutables: string[] = [];
    progress.stage("2/4 · Required dependency installation");
    if (pendingDependencies.length && !options.skipDependencies) {
      if (options.dryRun) assumedExecutables = assumedDependencyExecutables(dependencyPlan);
      else {
        const unresolved = pendingDependencies.filter((item) => item.status === "unresolved");
        if (unresolved.length) {
          const details = unresolved.map((item) => item.remediation ? `${item.name} (${item.remediation})` : item.name).join(", ");
          throw new Error(`No safe installer is available for required dependencies: ${details}. Install them manually or pass --skip-dependencies to inspect the remaining plan.`);
        }
        if (!options.yes && !(await confirm("Install the missing required dependencies? [y/N] "))) {
          throw new Error("Dependency installation cancelled; pass --yes to approve or --skip-dependencies to continue without it");
        }
        applyDependencies(dependencyPlan, (completed, total, label) => progress.update(completed, total, label));
        const remaining = (await planDependencies(options)).items.filter((item) => item.status !== "satisfied");
        if (remaining.length) throw new Error(`Required dependencies are still unavailable after installation: ${remaining.map((item) => item.name).join(", ")}`);
      }
    }
    progress.succeed(pendingDependencies.length ? `${pendingDependencies.length} dependency requirement${pendingDependencies.length === 1 ? "" : "s"} handled` : "All dependencies already available");

    progress.stage("3/4 · Configuration plan");
    const plan = await buildInstallPlan({ ...options, assumedExecutables });
    plan.dependencies = dependencyPlan.items;
    printPlan(plan, options.json);
    if (options.dryRun) return progress.finish("Preview complete · no files were changed");
    if (!plan.items.some((item) => item.kind !== "notice")) return progress.finish("No changes required.");
    if (!options.yes && !(await confirm("Apply this configuration plan? [y/N] "))) throw new Error("Installation cancelled; pass --yes for non-interactive apply");

    progress.stage("4/4 · Apply reversible configuration");
    const manifest = await applyPlan(plan, options, (completed, total, label) => progress.update(completed, total, label));
    progress.finish(manifest ? `Applied with backup: ${manifest.backupDir}` : "No changes applied.");
  } catch (error) {
    if (!options.json) {
      progress.fail((error as Error).message);
      markCliErrorReported(error);
    }
    throw error;
  }
}

export function registerInstallCommands(program: Command): void {
  program.command("install").description("preview and apply the selected capability preset").action(async () => install(globalOptions(program), "Install"));
  program.command("update").description("reconcile the selected preset with the installed release").action(async () => install(globalOptions(program), "Update"));
  program.command("diff").description("preview changes without writing").action(async () => install(globalOptions(program, { dryRun: true }), "Diff"));
}
