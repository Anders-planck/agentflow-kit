import { homedir } from "node:os";
import { resolve } from "node:path";

import { Command } from "commander";

import type { GlobalOptions, ReportFormat } from "../types.js";

export interface CliOptions {
  home: string;
  root: string;
  preset?: string;
  dir: string;
  dryRun?: boolean;
  json?: boolean;
  yes?: boolean;
  skipExternal?: boolean;
  skipDependencies?: boolean;
  adoptExisting?: boolean;
  format?: ReportFormat;
  output?: string;
  budget: string;
}

export function createCliProgram(version: string, root: string): Command {
  return new Command()
    .name("orditra")
    .description("One reversible capability fabric for Codex, Claude Code, and OpenCode.")
    .version(version)
    .option("--home <path>", "target a different home directory", homedir())
    .option("--root <path>", "toolkit source root", root)
    .option("--preset <name>", "override configured preset")
    .option("--dir <path>", "project directory", process.cwd())
    .option("--dry-run", "never mutate state")
    .option("--yes", "apply without interactive confirmation")
    .option("--json", "shortcut for --format json")
    .option("--format <format>", "terminal, json, markdown, sarif, or html", "terminal")
    .option("--output <path>", "write report to a file")
    .option("--budget <tokens>", "repository-map token budget", "2000")
    .option("--skip-external", "skip network fetches and external client commands")
    .option("--skip-dependencies", "do not offer to install missing required executables")
    .option("--adopt-existing", "back up and replace conflicting copies with shared links");
}

export function cliOptions(program: Command): CliOptions {
  return program.opts<CliOptions>();
}

export function globalOptions(program: Command, overrides: Partial<GlobalOptions> = {}): GlobalOptions {
  const values = cliOptions(program);
  const format = values.json ? "json" : values.format ?? "terminal";
  const budget = Number.parseInt(values.budget, 10);
  if (!Number.isFinite(budget) || budget <= 0) throw new Error("--budget must be a positive integer");
  return {
    home: resolve(values.home),
    root: resolve(values.root),
    dryRun: Boolean(values.dryRun),
    json: format === "json",
    yes: Boolean(values.yes),
    skipExternal: Boolean(values.skipExternal),
    skipDependencies: Boolean(values.skipDependencies),
    adoptExisting: Boolean(values.adoptExisting),
    format,
    budget,
    ...(values.preset ? { preset: values.preset } : {}),
    ...(values.output ? { output: resolve(values.output) } : {}),
    ...overrides,
  };
}
