import { createHash } from "node:crypto";
import { lstat, readFile, readdir, readlink } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import type { PlanItem } from "../types.js";

export async function readOptional(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "";
    throw error;
  }
}

export async function directoryNames(path: string): Promise<string[]> {
  try {
    const entries = await readdir(path, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

export function containsKeyDeep(value: unknown, key: string): boolean {
  if (!value || typeof value !== "object") return false;
  if (Object.prototype.hasOwnProperty.call(value, key)) return true;
  return Object.values(value as Record<string, unknown>).some((child) => containsKeyDeep(child, key));
}

export function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

export async function directoryDigest(path: string): Promise<string | null> {
  const hash = createHash("sha256");
  try {
    async function visit(directory: string, prefix = ""): Promise<void> {
      const entries = (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
      for (const entry of entries) {
        const relativePath = join(prefix, entry.name);
        const absolute = join(directory, entry.name);
        if (entry.isDirectory()) await visit(absolute, relativePath);
        else if (entry.isFile()) {
          hash.update(relativePath);
          hash.update(await readFile(absolute));
        } else if (entry.isSymbolicLink()) {
          hash.update(relativePath);
          hash.update("symlink:");
          hash.update(await readlink(absolute));
        }
      }
    }
    await visit(path);
    return hash.digest("hex");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function isWithin(parent: string, candidate: string): boolean {
  const pathFromParent = relative(parent, candidate);
  return pathFromParent === "" || (pathFromParent !== ".." && !pathFromParent.startsWith(`..${sep}`) && !isAbsolute(pathFromParent));
}

export async function planSymlink(
  items: PlanItem[],
  id: string,
  source: string,
  target: string,
  managedReleasesDir: string,
  adoptExisting = false,
): Promise<void> {
  try {
    const stat = await lstat(target);
    if (stat.isSymbolicLink()) {
      const current = await readlink(target);
      const resolvedCurrent = resolve(dirname(target), current);
      if (resolvedCurrent === resolve(source)) return;
      if (isWithin(resolve(managedReleasesDir), resolvedCurrent)) {
        items.push({ kind: "symlink", id, description: `Upgrade Orditra-managed skill ${target}`, source, target, replaceExisting: true });
        return;
      }
    }
    if (stat.isDirectory() && await directoryDigest(source) === await directoryDigest(target)) {
      items.push({ kind: "symlink", id, description: `Adopt content-identical skill ${target}`, source, target, replaceExisting: true });
      return;
    }
    if (adoptExisting) {
      items.push({ kind: "symlink", id, description: `Back up and adopt existing skill ${target}`, source, target, replaceExisting: true });
      return;
    }
    items.push({ kind: "notice", id: `${id}-conflict`, description: `Preserved unmanaged path: ${target}`, level: "warn" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    items.push({ kind: "symlink", id, description: `Link ${target}`, source, target });
  }
}
