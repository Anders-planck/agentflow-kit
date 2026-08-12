import type { Command } from "commander";

import { garbageCollect, rollbackLatest, uninstallAll } from "../executor.js";
import { globalOptions } from "./options.js";

export function registerLifecycleCommands(program: Command): void {
  program.command("rollback").description("restore the latest pre-install snapshot").action(async () => {
    const options = globalOptions(program);
    const manifest = await rollbackLatest(options);
    console.log(options.json ? JSON.stringify(manifest, null, 2) : `${options.dryRun ? "Would restore" : "Restored"} ${manifest.snapshots.length} paths from ${manifest.backupDir}`);
  });

  program.command("uninstall").description("unwind all Orditra changesets").action(async () => {
    const options = globalOptions(program);
    const preview = options.dryRun || !options.yes;
    const manifests = await uninstallAll({ ...options, dryRun: preview });
    const paths = manifests.reduce((total, manifest) => total + manifest.snapshots.length, 0);
    if (preview) console.log(options.json ? JSON.stringify(manifests, null, 2) : `Would unwind ${manifests.length} changesets and restore ${paths} paths; pass --yes to apply`);
    else console.log(options.json ? JSON.stringify(manifests, null, 2) : `Uninstalled Orditra by unwinding ${manifests.length} changesets`);
  });

  program.command("gc").description("remove orphan backups and unreferenced old releases")
    .option("--retain <count>", "minimum number of newest releases to retain", "3")
    .action(async (commandOptions: { retain: string }) => {
      const options = globalOptions(program);
      const retain = Number.parseInt(commandOptions.retain, 10);
      if (!Number.isFinite(retain) || retain < 0) throw new Error("--retain must be a non-negative integer");
      const result = await garbageCollect(options, retain);
      console.log(options.json ? JSON.stringify(result, null, 2) : `${options.dryRun ? "Would remove" : "Removed"} ${result.removed.length} orphan paths${result.removed.length ? `:\n${result.removed.join("\n")}` : ""}`);
    });
}
