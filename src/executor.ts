import { createHash } from "node:crypto";
import { cp, lstat, mkdir, mkdtemp, readFile, readdir, readlink, rename, rm, symlink, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { tmpdir } from "node:os";

import { capabilityIsActive } from "./capabilities.js";
import { findExecutable, runCommand } from "./commands.js";
import { loadSkillSources, packageVersion } from "./registry.js";
import { resolveAppPaths, resolveLegacyAppPaths } from "./paths.js";
import { directoryDigest } from "./planning/shared.js";
import type { AppPaths, AppliedCommand, GlobalOptions, InstallManifest, InstallPlan, PathSnapshot, PlanItem, ProgressCallback } from "./types.js";

async function assertExternalTreeSafe(path: string): Promise<void> {
  const stat = await lstat(path);
  if (stat.isSymbolicLink()) throw new Error(`External skill source contains a symbolic link: ${path}`);
  if (!stat.isDirectory()) throw new Error(`External skill source is not a directory: ${path}`);
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const child = join(path, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`External skill source contains a symbolic link: ${child}`);
    if (entry.isDirectory()) await assertExternalTreeSafe(child);
    else if (!entry.isFile()) throw new Error(`External skill source contains an unsupported file type: ${child}`);
  }
}

async function snapshotPath(target: string, backupDir: string, index: number): Promise<PathSnapshot> {
  try {
    const stat = await lstat(target);
    if (stat.isSymbolicLink()) {
      return { target, existed: true, type: "symlink", symlinkTarget: await readlink(target) };
    }
    const type = stat.isDirectory() ? "directory" : "file";
    const backupPath = join(backupDir, "paths", `${index}-${createHash("sha256").update(target).digest("hex").slice(0, 16)}`);
    await mkdir(dirname(backupPath), { recursive: true });
    if (type === "directory") await cp(target, backupPath, { recursive: true, preserveTimestamps: true });
    else await cp(target, backupPath, { preserveTimestamps: true });
    return { target, existed: true, type, backupPath };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { target, existed: false };
    throw error;
  }
}

async function restoreSnapshot(snapshot: PathSnapshot): Promise<void> {
  await rm(snapshot.target, { recursive: true, force: true });
  if (!snapshot.existed) return;
  await mkdir(dirname(snapshot.target), { recursive: true });
  if (snapshot.type === "symlink" && snapshot.symlinkTarget) {
    await symlink(snapshot.symlinkTarget, snapshot.target, process.platform === "win32" ? "junction" : undefined);
  } else if (snapshot.backupPath) {
    await cp(snapshot.backupPath, snapshot.target, { recursive: snapshot.type === "directory", preserveTimestamps: true });
  }
}

async function atomicWrite(target: string, content: string): Promise<void> {
  await mkdir(dirname(target), { recursive: true });
  const temporary = `${target}.orditra-${process.pid}.tmp`;
  await writeFile(temporary, content, { encoding: "utf8", mode: 0o600 });
  await rename(temporary, target);
}

async function loadManifestHistory(appPaths: AppPaths): Promise<string[]> {
  return await readManifestHistory(appPaths.appStateDir)
    ?? await readManifestHistory(resolveLegacyAppPaths(appPaths.home).appStateDir)
    ?? [];
}

async function readManifestHistory(stateDirectory: string): Promise<string[] | null> {
  const historyPath = join(stateDirectory, "manifest-history.json");
  try {
    const value = JSON.parse(await readFile(historyPath, "utf8")) as unknown;
    if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) throw new Error("Invalid manifest history");
    return value;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  try {
    const current = JSON.parse(await readFile(join(stateDirectory, "install-manifest.json"), "utf8")) as InstallManifest;
    return [join(current.backupDir, "manifest.json")];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function loadManifests(appPaths: AppPaths): Promise<Array<{ path: string; manifest: InstallManifest }>> {
  const paths = await loadManifestHistory(appPaths);
  return Promise.all(paths.map(async (path) => {
    const manifest = JSON.parse(await readFile(path, "utf8")) as InstallManifest;
    if (manifest.schemaVersion !== 1) throw new Error(`Unsupported install manifest version: ${path}`);
    return { path, manifest };
  }));
}

async function restoreManifest(manifest: InstallManifest, failures: string[]): Promise<void> {
  for (const command of [...manifest.commands].reverse()) {
    if (command.inverse) {
      try { runCommand(command.inverse); } catch (error) { failures.push((error as Error).message); }
    }
  }
  for (const snapshot of [...manifest.snapshots].reverse()) {
    try { await restoreSnapshot(snapshot); } catch (error) { failures.push((error as Error).message); }
  }
}

async function saveManifestPointers(appPaths: AppPaths, entries: Array<{ path: string; manifest: InstallManifest }>): Promise<void> {
  const historyPath = join(appPaths.appStateDir, "manifest-history.json");
  const currentPath = join(appPaths.appStateDir, "install-manifest.json");
  const legacyStateDir = resolveLegacyAppPaths(appPaths.home).appStateDir;
  const legacyPointers = [
    join(legacyStateDir, "manifest-history.json"),
    join(legacyStateDir, "install-manifest.json"),
  ];
  if (!entries.length) {
    await Promise.all([rm(historyPath, { force: true }), rm(currentPath, { force: true }), ...legacyPointers.map((path) => rm(path, { force: true }))]);
    return;
  }
  await atomicWrite(historyPath, `${JSON.stringify(entries.map((entry) => entry.path), null, 2)}\n`);
  await atomicWrite(currentPath, `${JSON.stringify(entries.at(-1)?.manifest, null, 2)}\n`);
  await Promise.all(legacyPointers.map((path) => rm(path, { force: true })));
}

async function installExternalSkills(
  item: Extract<PlanItem, { kind: "external-skills" }>,
  root: string,
  scan: boolean,
): Promise<void> {
  const registry = await loadSkillSources(root);
  const source = registry.sources[item.sourceName];
  const paths = source?.sets[item.skillSet];
  if (!source || !paths) throw new Error(`Unknown external skill source ${item.sourceName}/${item.skillSet}`);
  for (const path of [...paths, source.licensePath]) {
    if (path.startsWith("/") || path.split("/").includes("..")) throw new Error(`Unsafe external source path: ${path}`);
  }

  const temporary = await mkdtemp(join(tmpdir(), "orditra-skills-"));
  try {
    runCommand({ command: "git", args: ["-C", temporary, "init", "--quiet"] });
    runCommand({ command: "git", args: ["-C", temporary, "remote", "add", "origin", source.repository] });
    runCommand({ command: "git", args: ["-C", temporary, "fetch", "--quiet", "--depth", "1", "origin", source.commit] });
    runCommand({ command: "git", args: ["-C", temporary, "checkout", "--quiet", "FETCH_HEAD", "--", source.licensePath, ...paths] });
    const licenseStat = await lstat(join(temporary, source.licensePath));
    if (!licenseStat.isFile() || licenseStat.isSymbolicLink()) throw new Error(`External license is not a regular file for ${item.sourceName}`);
    const licenseDigest = createHash("sha256").update(await readFile(join(temporary, source.licensePath))).digest("hex");
    if (!source.licenseDigest || licenseDigest !== source.licenseDigest) throw new Error(`License digest mismatch for ${item.sourceName}`);
    for (const path of paths) {
      await assertExternalTreeSafe(join(temporary, path));
      const expected = source.contentDigests?.[path];
      const actual = await directoryDigest(join(temporary, path));
      if (!expected) throw new Error(`Missing content digest for external skill ${item.sourceName}:${path}`);
      if (actual !== expected) throw new Error(`Content digest mismatch for external skill ${item.sourceName}:${path}`);
    }
    if (scan) {
      if (!process.env.SNYK_TOKEN) throw new Error("Agent Scan is active but SNYK_TOKEN is not configured");
      const agentScan = findExecutable("snyk-agent-scan");
      if (!agentScan) throw new Error("Agent Scan is active but snyk-agent-scan is unavailable on PATH");
      for (const path of paths) {
        runCommand({ command: agentScan, args: [join(temporary, path)] });
      }
    }
    await mkdir(item.target, { recursive: true });
    for (const path of paths) {
      const name = path.split("/").at(-1);
      if (!name) throw new Error(`Invalid skill path: ${path}`);
      const target = join(item.target, name);
      await rm(target, { recursive: true, force: true });
      await cp(join(temporary, path), target, { recursive: true, preserveTimestamps: true });
    }
    const licenseTarget = join(item.target, ".licenses", item.sourceName, "LICENSE");
    await mkdir(dirname(licenseTarget), { recursive: true });
    await cp(join(temporary, source.licensePath), licenseTarget);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

function itemTarget(item: PlanItem): string | null {
  if (item.kind === "write" || item.kind === "symlink" || item.kind === "copy-dir" || item.kind === "external-skills") return item.target;
  return null;
}

export async function applyPlan(plan: InstallPlan, options: GlobalOptions, onProgress?: ProgressCallback): Promise<InstallManifest | null> {
  const errors = plan.items.filter((item) => item.kind === "notice" && item.level === "error");
  if (errors.length) throw new Error(errors.map((item) => item.description).join("\n"));
  const actionable = plan.items.filter((item) => item.kind !== "notice" && !(options.skipExternal && (item.kind === "command" || item.kind === "external-skills")));
  if (options.dryRun || actionable.length === 0) return null;

  const appPaths = resolveAppPaths(options.home);
  const stamp = new Date().toISOString().replaceAll(":", "-");
  const backupDir = join(appPaths.appStateDir, "backups", stamp);
  await mkdir(backupDir, { recursive: true });
  const snapshots: PathSnapshot[] = [];
  const snapshotTargets = new Set<string>();
  const commands: AppliedCommand[] = [];
  const ownedSymlinks: string[] = [];
  const scanExternalSkills = capabilityIsActive(plan.capabilities["agent-supply-chain"]);
  const journalPath = join(appPaths.appStateDir, "transaction.json");
  await atomicWrite(journalPath, `${JSON.stringify({ schemaVersion: 1, status: "applying", startedAt: new Date().toISOString(), items: actionable.map((item) => item.id) }, null, 2)}\n`);

  try {
    for (const [index, item] of actionable.entries()) {
      onProgress?.(index, actionable.length, item.description);
      await atomicWrite(journalPath, `${JSON.stringify({ schemaVersion: 1, status: "applying", index, currentItem: item.id, snapshots: snapshots.length, commands: commands.length }, null, 2)}\n`);
      const target = itemTarget(item);
      if (target && !snapshotTargets.has(target)) {
        snapshots.push(await snapshotPath(target, backupDir, snapshots.length));
        snapshotTargets.add(target);
      }
      switch (item.kind) {
        case "write":
          await atomicWrite(item.target, item.content);
          break;
        case "symlink":
          await mkdir(dirname(item.target), { recursive: true });
          if (item.replaceExisting) await rm(item.target, { recursive: true, force: true });
          await symlink(item.source, item.target, process.platform === "win32" ? "junction" : undefined);
          ownedSymlinks.push(item.target);
          break;
        case "copy-dir":
          await rm(item.target, { recursive: true, force: true });
          await mkdir(dirname(item.target), { recursive: true });
          await cp(item.source, item.target, { recursive: true, preserveTimestamps: true });
          break;
        case "external-skills":
          await installExternalSkills(item, options.root, scanExternalSkills);
          break;
        case "command":
          runCommand(item.spec);
          commands.push({ id: item.id, ...(item.spec.inverse ? { inverse: item.spec.inverse } : {}) });
          break;
        case "notice":
          break;
      }
      onProgress?.(index + 1, actionable.length, item.description);
    }
  } catch (error) {
    await atomicWrite(journalPath, `${JSON.stringify({ schemaVersion: 1, status: "rolling-back", error: (error as Error).message }, null, 2)}\n`);
    const rollbackFailures: string[] = [];
    for (const command of [...commands].reverse()) {
      if (command.inverse) {
        try { runCommand(command.inverse); } catch (rollbackError) { rollbackFailures.push((rollbackError as Error).message); }
      }
    }
    for (const snapshot of [...snapshots].reverse()) {
      try { await restoreSnapshot(snapshot); } catch (rollbackError) { rollbackFailures.push((rollbackError as Error).message); }
    }
    if (rollbackFailures.length) {
      await atomicWrite(journalPath, `${JSON.stringify({ schemaVersion: 1, status: "recovery-required", originalError: (error as Error).message, rollbackFailures }, null, 2)}\n`);
      throw new Error(`${(error as Error).message}\nRollback failures:\n${rollbackFailures.join("\n")}`);
    }
    await rm(journalPath, { force: true });
    throw error;
  }

  const manifest: InstallManifest = {
    schemaVersion: 1,
    toolkitVersion: await packageVersion(options.root),
    createdAt: new Date().toISOString(),
    preset: plan.preset.name,
    backupDir,
    snapshots,
    commands,
    ownedSymlinks,
  };
  const serialized = `${JSON.stringify(manifest, null, 2)}\n`;
  const backupManifestPath = join(backupDir, "manifest.json");
  await atomicWrite(backupManifestPath, serialized);
  const history = await loadManifests(appPaths);
  history.push({ path: backupManifestPath, manifest });
  await saveManifestPointers(appPaths, history);
  await rm(journalPath, { force: true });
  return manifest;
}

export async function rollbackLatest(options: GlobalOptions, onProgress?: ProgressCallback): Promise<InstallManifest> {
  const appPaths = resolveAppPaths(options.home);
  const history = await loadManifests(appPaths);
  const latest = history.at(-1);
  if (!latest) throw new Error("No Orditra installation manifest found");
  const manifest = latest.manifest;
  if (options.dryRun) return manifest;

  const failures: string[] = [];
  onProgress?.(0, 1, "Restoring the latest changeset");
  await restoreManifest(manifest, failures);
  onProgress?.(1, 1, "Restored the latest changeset");
  history.pop();
  await saveManifestPointers(appPaths, history);
  if (failures.length) throw new Error(`Rollback completed with failures:\n${failures.join("\n")}`);
  return manifest;
}

export async function uninstallAll(options: GlobalOptions, onProgress?: ProgressCallback): Promise<InstallManifest[]> {
  const appPaths = resolveAppPaths(options.home);
  const history = await loadManifests(appPaths);
  if (!history.length) throw new Error("No Orditra installation manifest found");
  const manifests = history.map((entry) => entry.manifest);
  if (options.dryRun) return manifests;

  const failures: string[] = [];
  for (const [index, entry] of [...history].reverse().entries()) {
    onProgress?.(index, history.length, `Unwinding changeset ${index + 1} of ${history.length}`);
    await restoreManifest(entry.manifest, failures);
    onProgress?.(index + 1, history.length, `Unwound changeset ${index + 1} of ${history.length}`);
  }
  await saveManifestPointers(appPaths, []);
  if (failures.length) throw new Error(`Uninstall completed with failures:\n${failures.join("\n")}`);
  return manifests;
}

export interface GarbageCollectionResult {
  removed: string[];
  retainedReleases: string[];
}

async function childDirectories(path: string): Promise<string[]> {
  try { return (await readdir(path, { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => join(path, entry.name)); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
}

export async function garbageCollect(options: GlobalOptions, retainReleases = 3, onProgress?: ProgressCallback): Promise<GarbageCollectionResult> {
  const appPaths = resolveAppPaths(options.home);
  const history = await loadManifests(appPaths);
  const referencedBackups = new Set(history.map((entry) => resolve(entry.manifest.backupDir)));
  const backupRoot = join(appPaths.appStateDir, "backups");
  const orphanBackups = (await childDirectories(backupRoot)).filter((path) => !referencedBackups.has(resolve(path)));

  const releasesRoot = join(appPaths.appDataDir, "releases");
  const releases = (await childDirectories(releasesRoot)).sort();
  const referencedReleases = new Set<string>();
  for (const skillRoot of [join(appPaths.home, ".agents", "skills"), join(appPaths.home, ".claude", "skills")]) {
    let names: string[] = [];
    try { names = await readdir(skillRoot); } catch { /* Optional root. */ }
    for (const name of names) {
      const target = join(skillRoot, name);
      try {
        if (!(await lstat(target)).isSymbolicLink()) continue;
        const resolvedTarget = resolve(dirname(target), await readlink(target));
        const fromReleases = relative(resolve(releasesRoot), resolvedTarget);
        if (fromReleases !== ".." && !fromReleases.startsWith(`..${sep}`)) {
          const release = fromReleases.split(sep)[0];
          if (release) referencedReleases.add(resolve(releasesRoot, release));
        }
      } catch { /* Ignore broken optional links. */ }
    }
  }
  const keepNewest = new Set(releases.slice(-Math.max(0, retainReleases)).map((path) => resolve(path)));
  const orphanReleases = releases.filter((path) => !referencedReleases.has(resolve(path)) && !keepNewest.has(resolve(path)));
  const removed = [...orphanBackups, ...orphanReleases];
  if (!options.dryRun) for (const [index, path] of removed.entries()) {
    onProgress?.(index, removed.length, `Removing ${path}`);
    await rm(path, { recursive: true, force: true });
    onProgress?.(index + 1, removed.length, `Removed ${path}`);
  }
  return { removed, retainedReleases: releases.filter((path) => !orphanReleases.includes(path)) };
}
