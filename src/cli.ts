#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";

import { formatCommand } from "./commands.js";
import { runDoctor } from "./doctor.js";
import { applyPlan, rollbackLatest, uninstallAll } from "./executor.js";
import { findProjectRoot, pathExists, resolveAppPaths } from "./paths.js";
import { buildInstallPlan } from "./planner.js";
import { applyProjectInit, planProjectInit } from "./project.js";
import { packageVersion } from "./registry.js";
import type { GlobalOptions, InstallPlan, PlanItem } from "./types.js";
import { validateRepository } from "./validate.js";

interface ParsedArguments {
  command: string;
  subcommand?: string;
  options: GlobalOptions;
  directory: string;
}

function parseArguments(argv: string[]): ParsedArguments {
  const values = [...argv];
  const command = values.shift() ?? "help";
  const subcommand = command === "project" ? values.shift() : undefined;
  const options: GlobalOptions = {
    home: homedir(),
    root: findProjectRoot(),
    dryRun: false,
    json: false,
    yes: false,
    skipExternal: false,
    adoptExisting: false,
  };
  let directory = process.cwd();
  while (values.length) {
    const flag = values.shift();
    switch (flag) {
      case "--home": options.home = resolve(requiredValue(flag, values)); break;
      case "--root": options.root = resolve(requiredValue(flag, values)); break;
      case "--preset": options.preset = requiredValue(flag, values); break;
      case "--dir": directory = resolve(requiredValue(flag, values)); break;
      case "--dry-run": options.dryRun = true; break;
      case "--json": options.json = true; break;
      case "--yes": options.yes = true; break;
      case "--skip-external": options.skipExternal = true; break;
      case "--adopt-existing": options.adoptExisting = true; break;
      case "--help": return { command: "help", options, directory };
      default: throw new Error(`Unknown argument: ${flag}`);
    }
  }
  return { command, ...(subcommand ? { subcommand } : {}), options, directory };
}

function requiredValue(flag: string, values: string[]): string {
  const value = values.shift();
  if (!value) throw new Error(`${flag} requires a value`);
  return value;
}

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

function printPlan(plan: InstallPlan, json: boolean): void {
  if (json) {
    console.log(JSON.stringify(plan, null, 2));
    return;
  }
  console.log(`Preset: ${plan.preset.name}`);
  console.log(`Clients: ${Object.entries(plan.clients).filter(([, enabled]) => enabled).map(([name]) => name).join(", ") || "none"}`);
  if (!plan.items.length) console.log("No changes required.");
  for (const item of plan.items) console.log(itemSummary(item));
}

async function confirmApply(): Promise<boolean> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) return false;
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await prompt.question("Apply this plan? [y/N] ");
    return /^y(?:es)?$/i.test(answer.trim());
  } finally { prompt.close(); }
}

async function install(options: GlobalOptions): Promise<void> {
  const plan = await buildInstallPlan(options);
  printPlan(plan, options.json);
  if (options.dryRun || !plan.items.some((item) => item.kind !== "notice")) return;
  if (!options.yes && !(await confirmApply())) throw new Error("Installation cancelled; pass --yes for non-interactive apply");
  const manifest = await applyPlan(plan, options);
  if (!options.json) console.log(manifest ? `Applied with backup: ${manifest.backupDir}` : "No changes applied.");
}

async function initUserConfig(options: GlobalOptions): Promise<void> {
  const paths = resolveAppPaths(options.home);
  const target = join(paths.appConfigDir, "config.yaml");
  if (pathExists(target)) {
    console.log(options.json ? JSON.stringify({ target, action: "preserve" }) : `Preserved existing ${target}`);
    return;
  }
  const content = `schemaVersion: 1\npreset: ${options.preset ?? "recommended"}\nclients: auto\ncomponents: {}\n`;
  if (options.dryRun) {
    console.log(options.json ? JSON.stringify({ target, action: "create", content }) : `CREATE  ${target}`);
    return;
  }
  await mkdir(paths.appConfigDir, { recursive: true });
  await writeFile(target, content, { encoding: "utf8", flag: "wx", mode: 0o600 });
  console.log(options.json ? JSON.stringify({ target, action: "created" }) : `Created ${target}`);
}

async function main(): Promise<void> {
  const parsed = parseArguments(process.argv.slice(2));
  const { command, options } = parsed;
  if (command === "help") return printHelp();
  if (command === "version" || command === "--version" || command === "-v") {
    console.log(await packageVersion(options.root));
    return;
  }
  if (command === "install" || command === "update") return install(options);
  if (command === "diff") return install({ ...options, dryRun: true });
  if (command === "init") return initUserConfig(options);
  if (command === "doctor") {
    const checks = await runDoctor(options.home);
    if (options.json) console.log(JSON.stringify(checks, null, 2));
    else for (const check of checks) console.log(`[${check.status.toUpperCase()}] ${check.message}`);
    if (checks.some((check) => check.status === "fail")) process.exitCode = 1;
    return;
  }
  if (command === "rollback") {
    const manifest = await rollbackLatest(options);
    console.log(options.json ? JSON.stringify(manifest, null, 2) : `${options.dryRun ? "Would restore" : "Restored"} ${manifest.snapshots.length} paths from ${manifest.backupDir}`);
    return;
  }
  if (command === "uninstall") {
    const preview = options.dryRun || !options.yes;
    const manifests = await uninstallAll({ ...options, dryRun: preview });
    const paths = manifests.reduce((total, manifest) => total + manifest.snapshots.length, 0);
    if (preview) console.log(options.json ? JSON.stringify(manifests, null, 2) : `Would unwind ${manifests.length} changesets and restore ${paths} paths; pass --yes to apply`);
    else console.log(options.json ? JSON.stringify(manifests, null, 2) : `Uninstalled Agentflow by unwinding ${manifests.length} changesets`);
    return;
  }
  if (command === "project" && parsed.subcommand === "init") {
    const result = await planProjectInit(parsed.directory);
    if (!options.dryRun) await applyProjectInit(result);
    console.log(options.json ? JSON.stringify(result, null, 2) : `${result.action.toUpperCase()} ${result.target}`);
    return;
  }
  if (command === "validate") {
    const issues = await validateRepository(options.root);
    if (options.json) console.log(JSON.stringify(issues, null, 2));
    else if (!issues.length) console.log("Validation passed.");
    else for (const issue of issues) console.log(`[${issue.level.toUpperCase()}] ${issue.path}: ${issue.message}`);
    if (issues.some((issue) => issue.level === "error")) process.exitCode = 1;
    return;
  }
  throw new Error(`Unknown command: ${command}`);
}

function printHelp(): void {
  console.log(`agentflow-kit

Usage: agentflow <command> [options]

Commands:
  install          Preview and apply a preset
  diff             Preview changes without writing
  init             Create user configuration
  doctor           Inspect clients, integrations, and skill divergence
  update           Reconcile the selected preset with the installed release
  rollback         Restore the latest pre-install snapshot
  uninstall        Preview removal; add --yes to unwind every changeset
  project init     Create .agentflow/project.yaml without overwriting
  validate         Validate repository YAML, skills, and public-safety rules
  version          Print toolkit version

Options:
  --preset <name>  Override config.yaml (fallback: recommended)
  --home <path>    Target a different home directory
  --root <path>    Toolkit source root
  --dir <path>     Project directory for project init
  --dry-run        Never mutate state
  --yes            Apply without an interactive confirmation
  --json           Machine-readable output
  --skip-external  Skip network fetches and external client commands
  --adopt-existing Back up and replace conflicting copies with shared links
`);
}

main().catch((error: unknown) => {
  console.error(`agentflow: ${(error as Error).message}`);
  process.exitCode = 1;
});
