import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { Command } from "commander";

import { explainConfiguration } from "../explain.js";
import { pathExists, resolveAppPaths } from "../paths.js";
import { applyUserConfigMigration, planUserConfigMigration } from "../user-config.js";
import { globalOptions } from "./options.js";
import { emitFindings } from "./output.js";

async function initUserConfig(program: Command): Promise<void> {
  const options = globalOptions(program);
  const target = join(resolveAppPaths(options.home).appConfigDir, "config.yaml");
  if (pathExists(target)) return console.log(options.json ? JSON.stringify({ target, action: "preserve" }) : `Preserved existing ${target}`);
  const content = `schemaVersion: 2\npreset: ${options.preset ?? "recommended"}\nclients: auto\ncapabilities: {}\nprofiles: []\n`;
  if (options.dryRun) return console.log(options.json ? JSON.stringify({ target, action: "create", content }) : `CREATE  ${target}`);
  await mkdir(resolveAppPaths(options.home).appConfigDir, { recursive: true });
  await writeFile(target, content, { encoding: "utf8", flag: "wx", mode: 0o600 });
  console.log(options.json ? JSON.stringify({ target, action: "created" }) : `Created ${target}`);
}

export function registerInitCommand(program: Command): void {
  program.command("init").description("create schema-v2 user configuration").action(async () => initUserConfig(program));
}

export function registerConfigurationCommands(program: Command): void {
  const config = program.command("config").description("inspect and migrate resolved configuration");
  config.command("explain").action(async () => {
    const options = globalOptions(program);
    await emitFindings(await explainConfiguration(options.home, options.root, options.preset), options);
  });
  config.command("migrate").description("migrate schema-v1 user configuration to schema v2").action(async () => {
    const options = globalOptions(program);
    const result = await planUserConfigMigration(options.home);
    if (!options.dryRun) await applyUserConfigMigration(result);
    console.log(options.json ? JSON.stringify(result, null, 2) : `${result.action.toUpperCase()} ${result.target}`);
  });
}
