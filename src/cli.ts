#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { registerConfigurationCommands, registerInitCommand } from "./cli/configuration.js";
import { registerDiagnosticCommands, registerValidationCommands } from "./cli/diagnostics.js";
import { registerInstallCommands } from "./cli/install.js";
import { registerLifecycleCommands } from "./cli/lifecycle.js";
import { createCliProgram } from "./cli/options.js";
import { registerProjectCommands } from "./cli/project.js";
import { registerSkillCommands } from "./cli/skills.js";
import { findProjectRoot } from "./paths.js";

const root = findProjectRoot();
const { version } = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { version: string };
const program = createCliProgram(version, root);

registerInstallCommands(program);
registerInitCommand(program);
registerDiagnosticCommands(program);
registerLifecycleCommands(program);
registerProjectCommands(program);
registerConfigurationCommands(program);
registerSkillCommands(program);
registerValidationCommands(program);

program.parseAsync(process.argv).catch((error: unknown) => {
  console.error(`orditra: ${(error as Error).message}`);
  process.exitCode = 1;
});
