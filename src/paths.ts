import { accessSync, constants, lstatSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { AppPaths } from "./types.js";

export function findProjectRoot(start = dirname(fileURLToPath(import.meta.url))): string {
  const configuredRoot = process.env.ORDITRA_ROOT ?? process.env.AGENTFLOW_ROOT;
  if (configuredRoot) return resolve(configuredRoot);
  let current = resolve(start);
  while (true) {
    const packagePath = join(current, "package.json");
    try {
      const packageJson = JSON.parse(readFileSync(packagePath, "utf8")) as { name?: string };
      if (packageJson.name === "orditra") return current;
    } catch {
      // Continue toward the filesystem root.
    }
    const parent = dirname(current);
    if (parent === current) throw new Error("Unable to locate the orditra root");
    current = parent;
  }
}

export function resolveAppPaths(home: string): AppPaths {
  return resolveNamedAppPaths(home, "orditra");
}

/** Compatibility for installations made under the provisional pre-release name. */
export function resolveLegacyAppPaths(home: string): AppPaths {
  return resolveNamedAppPaths(home, "agentflow-kit");
}

function resolveNamedAppPaths(home: string, name: string): AppPaths {
  const normalizedHome = resolve(home);
  const configDir = join(normalizedHome, ".config");
  const dataDir = join(normalizedHome, ".local", "share");
  const stateDir = join(normalizedHome, ".local", "state");
  return {
    home: normalizedHome,
    configDir,
    dataDir,
    stateDir,
    appConfigDir: join(configDir, name),
    appDataDir: join(dataDir, name),
    appStateDir: join(stateDir, name),
  };
}

export function pathExists(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
}

export function isExecutable(path: string): boolean {
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}
