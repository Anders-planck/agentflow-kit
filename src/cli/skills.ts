import type { Command } from "commander";

import { explainSkill } from "../explain.js";
import { globalOptions } from "./options.js";

export function registerSkillCommands(program: Command): void {
  const skills = program.command("skills").description("inspect skill provenance and activation");
  skills.command("explain <name>").action(async (name: string) => {
    const options = globalOptions(program);
    const explanation = await explainSkill(name, options.home, options.root);
    console.log(options.json ? JSON.stringify(explanation, null, 2) : `${explanation.name}: ${explanation.source}\n${explanation.description ?? "No description"}\nScopes: ${explanation.activeScopes.join(", ") || "not active"}\n${explanation.path ?? explanation.provenance ?? ""}`);
  });
}
