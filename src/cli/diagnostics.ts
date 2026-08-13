import { resolve } from "node:path";

import type { Command } from "commander";

import { runDoctor } from "../doctor.js";
import { buildRepositoryMap } from "../repository-map.js";
import { packageVersion } from "../registry.js";
import type { Finding } from "../types.js";
import { validateRepository } from "../validate.js";
import { cliOptions, globalOptions } from "./options.js";
import { emitFindings } from "./output.js";

export function registerDiagnosticCommands(program: Command): void {
  program.command("doctor").description("inspect clients, providers, integrations, and skills").action(async () => {
    const options = globalOptions(program);
    const findings = await runDoctor(options.home, options.root, options.preset);
    await emitFindings(findings, options);
    if (findings.some((finding) => finding.status === "error")) process.exitCode = 1;
  });

  program.command("report").description("combine doctor and repository validation findings").action(async () => {
    const options = globalOptions(program);
    const doctor = await runDoctor(options.home, options.root, options.preset);
    const validation = (await validateRepository(options.root)).map((issue): Finding => ({
      id: `validation-${issue.path}-${issue.message}`,
      capability: "validation",
      status: issue.level === "error" ? "error" : "warning",
      summary: issue.message,
      source: issue.path,
    }));
    await emitFindings([...doctor, ...validation], options);
    if (validation.some((finding) => finding.status === "error")) process.exitCode = 1;
  });

  program.command("map").description("build a local token-budgeted repository map").action(async () => {
    const options = globalOptions(program);
    const map = await buildRepositoryMap(resolve(cliOptions(program).dir), options.budget ?? 2000);
    if (options.json && !options.output) return console.log(JSON.stringify(map, null, 2));
    await emitFindings(map.findings, options);
  });
}

export function registerValidationCommands(program: Command): void {
  program.command("validate").description("validate schemas, skills, registries, and public-safety rules").action(async () => {
    const options = globalOptions(program);
    const issues = await validateRepository(options.root);
    if (options.format !== "terminal" || options.output) {
      await emitFindings(issues.map((issue): Finding => ({ id: `validation-${issue.path}`, capability: "validation", status: issue.level === "error" ? "error" : "warning", summary: issue.message, source: issue.path })), options);
    } else if (!issues.length) console.log("Validation passed.");
    else for (const issue of issues) console.log(`[${issue.level.toUpperCase()}] ${issue.path}: ${issue.message}`);
    if (issues.some((issue) => issue.level === "error")) process.exitCode = 1;
  });

  program.command("version").alias("v").description("print toolkit version").action(async () => console.log(await packageVersion(globalOptions(program).root)));
}
