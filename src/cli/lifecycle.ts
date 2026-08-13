import type { Command } from "commander";

import { garbageCollect, rollbackLatest, uninstallAll } from "../executor.js";
import { globalOptions } from "./options.js";
import { createProgressFlow } from "./progress.js";

export function registerLifecycleCommands(program: Command): void {
  program.command("rollback").description("restore the latest pre-install snapshot").action(async () => {
    const options = globalOptions(program);
    const progress = createProgressFlow("Rollback", !options.json);
    progress.start("Restore the most recent reversible backup");
    try {
      progress.stage("Restore configuration");
      const manifest = await rollbackLatest(options, (completed, total, label) => progress.update(completed, total, label));
      if (options.json) console.log(JSON.stringify(manifest, null, 2));
      else progress.finish(`${options.dryRun ? "Would restore" : "Restored"} ${manifest.snapshots.length} paths from ${manifest.backupDir}`);
    } catch (error) {
      progress.fail((error as Error).message);
      throw error;
    }
  });

  program.command("uninstall").description("unwind all Orditra changesets").action(async () => {
    const options = globalOptions(program);
    const progress = createProgressFlow("Uninstall", !options.json);
    progress.start("Unwind every Orditra changeset in reverse order");
    const preview = options.dryRun || !options.yes;
    try {
      progress.stage(preview ? "Uninstall preview" : "Restore configuration and remove managed links");
      const manifests = await uninstallAll({ ...options, dryRun: preview }, (completed, total, label) => progress.update(completed, total, label));
      const paths = manifests.reduce((total, manifest) => total + manifest.snapshots.length, 0);
      if (options.json) console.log(JSON.stringify(manifests, null, 2));
      else if (preview) progress.finish(`Would unwind ${manifests.length} changesets and restore ${paths} paths; pass --yes to apply`);
      else progress.finish(`Uninstalled Orditra by unwinding ${manifests.length} changesets`);
    } catch (error) {
      progress.fail((error as Error).message);
      throw error;
    }
  });

  program.command("gc").description("remove orphan backups and unreferenced old releases")
    .option("--retain <count>", "minimum number of newest releases to retain", "3")
    .action(async (commandOptions: { retain: string }) => {
      const options = globalOptions(program);
      const progress = createProgressFlow("Garbage collection", !options.json);
      progress.start(`Retain at least ${commandOptions.retain} recent releases`);
      try {
        const retain = Number.parseInt(commandOptions.retain, 10);
        if (!Number.isFinite(retain) || retain < 0) throw new Error("--retain must be a non-negative integer");
        progress.stage(options.dryRun ? "Cleanup preview" : "Remove unreferenced backups and releases");
        const result = await garbageCollect(options, retain, (completed, total, label) => progress.update(completed, total, label));
        if (options.json) console.log(JSON.stringify(result, null, 2));
        else {
          if (result.removed.length) for (const path of result.removed) progress.info(path);
          progress.finish(`${options.dryRun ? "Would remove" : "Removed"} ${result.removed.length} orphan paths`);
        }
      } catch (error) {
        progress.fail((error as Error).message);
        throw error;
      }
    });
}
