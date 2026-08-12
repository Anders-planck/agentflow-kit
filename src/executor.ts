import { createHash } from "node:crypto";
import { cp, lstat, mkdir, mkdtemp, readFile, readlink, rename, rm, symlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

import { runCommand } from "./commands.js";
import { loadSkillSources, packageVersion } from "./registry.js";
import { resolveAppPaths } from "./paths.js";
import type { AppliedCommand, GlobalOptions, InstallManifest, InstallPlan, PathSnapshot, PlanItem } from "./types.js";

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
  const temporary = `${target}.agentflow-${process.pid}.tmp`;
  await writeFile(temporary, content, { encoding: "utf8", mode: 0o600 });
  await rename(temporary, target);
}

async function installExternalSkills(item: Extract<PlanItem, { kind: "external-skills" }>, root: string): Promise<void> {
  const registry = await loadSkillSources(root);
  const source = registry.sources[item.sourceName];
  const paths = source?.sets[item.skillSet];
  if (!source || !paths) throw new Error(`Unknown external skill source ${item.sourceName}/${item.skillSet}`);
  for (const path of [...paths, source.licensePath]) {
    if (path.startsWith("/") || path.split("/").includes("..")) throw new Error(`Unsafe external source path: ${path}`);
  }

  const temporary = await mkdtemp(join(tmpdir(), "agentflow-skills-"));
  try {
    runCommand({ command: "git", args: ["-C", temporary, "init", "--quiet"] });
    runCommand({ command: "git", args: ["-C", temporary, "remote", "add", "origin", source.repository] });
    runCommand({ command: "git", args: ["-C", temporary, "fetch", "--quiet", "--depth", "1", "origin", source.commit] });
    runCommand({ command: "git", args: ["-C", temporary, "checkout", "--quiet", "FETCH_HEAD", "--", source.licensePath, ...paths] });
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

export async function applyPlan(plan: InstallPlan, options: GlobalOptions): Promise<InstallManifest | null> {
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

  try {
    for (const item of actionable) {
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
          await symlink(item.source, item.target, process.platform === "win32" ? "junction" : undefined);
          ownedSymlinks.push(item.target);
          break;
        case "copy-dir":
          await rm(item.target, { recursive: true, force: true });
          await mkdir(dirname(item.target), { recursive: true });
          await cp(item.source, item.target, { recursive: true, preserveTimestamps: true });
          break;
        case "external-skills":
          await installExternalSkills(item, options.root);
          break;
        case "command":
          runCommand(item.spec);
          commands.push({ id: item.id, ...(item.spec.inverse ? { inverse: item.spec.inverse } : {}) });
          break;
        case "notice":
          break;
      }
    }
  } catch (error) {
    for (const command of [...commands].reverse()) {
      if (command.inverse) {
        try { runCommand(command.inverse); } catch { /* Best-effort command rollback. */ }
      }
    }
    for (const snapshot of [...snapshots].reverse()) await restoreSnapshot(snapshot);
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
  await atomicWrite(join(backupDir, "manifest.json"), serialized);
  await atomicWrite(join(appPaths.appStateDir, "install-manifest.json"), serialized);
  return manifest;
}

export async function rollbackLatest(options: GlobalOptions): Promise<InstallManifest> {
  const appPaths = resolveAppPaths(options.home);
  const manifestPath = join(appPaths.appStateDir, "install-manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as InstallManifest;
  if (manifest.schemaVersion !== 1) throw new Error("Unsupported install manifest version");
  if (options.dryRun) return manifest;

  const failures: string[] = [];
  for (const command of [...manifest.commands].reverse()) {
    if (command.inverse) {
      try { runCommand(command.inverse); } catch (error) { failures.push((error as Error).message); }
    }
  }
  for (const snapshot of [...manifest.snapshots].reverse()) {
    try { await restoreSnapshot(snapshot); } catch (error) { failures.push((error as Error).message); }
  }
  await rm(manifestPath, { force: true });
  if (failures.length) throw new Error(`Rollback completed with failures:\n${failures.join("\n")}`);
  return manifest;
}
