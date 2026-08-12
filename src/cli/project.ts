import { resolve } from "node:path";

import type { Command } from "commander";

import { applyProjectInit, applyProjectSync, planProjectInit, planProjectSync } from "../project.js";
import { loadUserConfig } from "../user-config.js";
import { cliOptions, globalOptions } from "./options.js";

function projectSummary(result: Awaited<ReturnType<typeof planProjectSync>>): string {
  return `${result.action.toUpperCase()} ${result.target}\n${result.skills.map((skill) => `${skill.action.toUpperCase().padEnd(9)} ${skill.name}`).join("\n")}`;
}

export function registerProjectCommands(program: Command): void {
  const project = program.command("project").description("manage project-local profiles and skills");
  project.command("init").description("create .orditra/project.yaml without overwriting").action(async () => {
    const options = globalOptions(program);
    const result = await planProjectInit(resolve(cliOptions(program).dir));
    if (!options.dryRun) await applyProjectInit(result);
    console.log(options.json ? JSON.stringify(result, null, 2) : `${result.action.toUpperCase()} ${result.target}`);
  });
  project.command("diff").description("preview project detection and repo-local skill changes").action(async () => {
    const options = globalOptions(program, { dryRun: true });
    const config = await loadUserConfig(options.home, options.root);
    const result = await planProjectSync(resolve(cliOptions(program).dir), options.root, config.profiles ?? []);
    console.log(options.json ? JSON.stringify(result, null, 2) : projectSummary(result));
  });
  project.command("sync").description("detect the project and materialize safe repo-local skills").action(async () => {
    const options = globalOptions(program);
    const config = await loadUserConfig(options.home, options.root);
    const result = await planProjectSync(resolve(cliOptions(program).dir), options.root, config.profiles ?? []);
    if (!options.dryRun) await applyProjectSync(result);
    console.log(options.json ? JSON.stringify(result, null, 2) : projectSummary(result));
  });
}
