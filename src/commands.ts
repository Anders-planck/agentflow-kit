import { accessSync, constants } from "node:fs";
import { delimiter, join } from "node:path";
import { spawnSync } from "node:child_process";

import type { CommandSpec } from "./types.js";

export interface CommandResult {
  status: number;
  stdout: string;
  stderr: string;
  durationMs: number;
}

export function findExecutable(name: string, pathValue = process.env.PATH ?? ""): string | null {
  const suffixes = process.platform === "win32" ? [".exe", ".cmd", ".bat", ""] : [""];
  for (const directory of pathValue.split(delimiter).filter(Boolean)) {
    for (const suffix of suffixes) {
      const candidate = join(directory, `${name}${suffix}`);
      try {
        accessSync(candidate, process.platform === "win32" ? constants.F_OK : constants.X_OK);
        return candidate;
      } catch { /* Try the next PATH entry. */ }
    }
  }
  return null;
}

function redact(value: string): string {
  return value
    .replace(/\b(gh[pousr]_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16})\b/g, "[REDACTED]")
    .replace(/([?&](?:token|key|secret|password)=)[^&\s]+/gi, "$1[REDACTED]")
    .replace(/(authorization:\s*(?:bearer|basic)\s+)[^\s]+/gi, "$1[REDACTED]");
}

export function runCommand(spec: CommandSpec): CommandResult {
  const started = Date.now();
  const result = spawnSync(spec.command, spec.args, {
    ...(spec.cwd ? { cwd: spec.cwd } : {}),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: spec.timeoutMs ?? 120_000,
    maxBuffer: 10 * 1024 * 1024,
  });
  const stdout = redact(result.stdout ?? "");
  const stderr = redact(result.stderr ?? "");
  if (result.error) throw new Error(`Command failed (${formatCommand(spec)}): ${redact(result.error.message)}`);
  if (result.status !== 0) {
    const output = `${stdout}\n${stderr}`.trim().split("\n").slice(-20).join("\n");
    throw new Error(`Command failed (${formatCommand(spec)}):\n${output}`);
  }
  return { status: result.status ?? 0, stdout, stderr, durationMs: Date.now() - started };
}

export function formatCommand(spec: CommandSpec): string {
  return [spec.command, ...spec.args].map((value, index) => shellQuote(index > 0 && /token|secret|password|api[-_]?key/i.test(spec.args[index - 2] ?? "") ? "[REDACTED]" : value)).join(" ");
}

function shellQuote(value: string): string {
  return /^[A-Za-z0-9_./:@=-]+$/.test(value) ? value : `'${value.replaceAll("'", `'\\''`)}'`;
}
