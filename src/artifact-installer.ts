import { createHash } from "node:crypto";
import { basename, dirname, join, posix, relative } from "node:path";
import { tmpdir } from "node:os";
import { chmod, copyFile, lstat, link, mkdir, mkdtemp, readdir, realpath, rm, unlink, writeFile } from "node:fs/promises";

import { runCommand } from "./commands.js";
import type { ArtifactInstallSpec, DependencyInstallSpec } from "./types.js";

const MAX_ARTIFACT_BYTES = 256 * 1024 * 1024;

export function isArtifactInstallSpec(spec: DependencyInstallSpec): spec is ArtifactInstallSpec {
  return "kind" in spec && spec.kind === "artifact";
}

function validateArchiveListing(names: string, verbose: string): void {
  const entries = names.split("\n").map((entry) => entry.trim()).filter(Boolean);
  if (!entries.length) throw new Error("Verified dependency archive is empty");
  for (const entry of entries) {
    const normalized = posix.normalize(entry.replaceAll("\\", "/"));
    if (posix.isAbsolute(normalized) || normalized === ".." || normalized.startsWith("../")) {
      throw new Error(`Unsafe path in dependency archive: ${entry}`);
    }
  }
  for (const line of verbose.split("\n").filter(Boolean)) {
    if (!line.startsWith("-") && !line.startsWith("d")) {
      throw new Error("Dependency archive contains links or unsupported entry types");
    }
  }
}

async function findRegularExecutable(root: string, executable: string): Promise<string> {
  const matches: string[] = [];
  async function walk(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error("Dependency archive contains a symbolic link");
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile() && entry.name === executable) matches.push(path);
    }
  }
  await walk(root);
  if (matches.length !== 1) throw new Error(`Expected one ${executable} executable in dependency archive, found ${matches.length}`);
  const resolvedRoot = await realpath(root);
  const resolvedMatch = await realpath(matches[0]!);
  const relativeMatch = relative(resolvedRoot, resolvedMatch);
  if (relativeMatch === ".." || relativeMatch.startsWith(`..${posix.sep}`)) {
    throw new Error("Dependency executable escapes the extraction directory");
  }
  return resolvedMatch;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

export async function installVerifiedArtifact(spec: ArtifactInstallSpec): Promise<void> {
  const url = new URL(spec.url);
  if (url.protocol !== "https:") throw new Error(`Dependency artifact must use HTTPS: ${spec.url}`);
  const temporary = await mkdtemp(join(tmpdir(), "orditra-artifact-"));
  const staging = join(dirname(spec.target), `.${basename(spec.target)}.orditra-${process.pid}-${Date.now()}`);
  try {
    const response = await fetch(url, { redirect: "follow" });
    if (!response.ok) throw new Error(`Dependency artifact download failed with HTTP ${response.status}: ${spec.url}`);
    if (response.url && new URL(response.url).protocol !== "https:") throw new Error(`Dependency artifact redirected away from HTTPS: ${spec.url}`);
    const declaredSize = Number(response.headers.get("content-length") ?? "0");
    if (declaredSize > MAX_ARTIFACT_BYTES) throw new Error(`Dependency artifact exceeds ${MAX_ARTIFACT_BYTES} bytes`);
    const payload = Buffer.from(await response.arrayBuffer());
    if (payload.byteLength > MAX_ARTIFACT_BYTES) throw new Error(`Dependency artifact exceeds ${MAX_ARTIFACT_BYTES} bytes`);
    const digest = createHash("sha256").update(payload).digest("hex");
    if (digest !== spec.sha256) throw new Error(`Dependency artifact checksum mismatch for ${spec.url}`);

    const archive = join(temporary, "artifact.tar.gz");
    const extracted = join(temporary, "extracted");
    await writeFile(archive, payload, { mode: 0o600 });
    await mkdir(extracted, { mode: 0o700 });
    const names = runCommand({ command: spec.extractor, args: ["-tzf", archive], timeoutMs: 30_000 });
    const verbose = runCommand({ command: spec.extractor, args: ["-tvzf", archive], timeoutMs: 30_000 });
    validateArchiveListing(names.stdout, verbose.stdout);
    runCommand({ command: spec.extractor, args: ["-xzf", archive, "-C", extracted], timeoutMs: 60_000 });
    const source = await findRegularExecutable(extracted, spec.executable);

    await mkdir(dirname(spec.target), { recursive: true, mode: 0o755 });
    if (await pathExists(spec.target)) throw new Error(`Dependency target already exists: ${spec.target}`);
    await copyFile(source, staging);
    await chmod(staging, 0o755);
    await link(staging, spec.target);
    await unlink(staging);
  } finally {
    await rm(staging, { force: true });
    await rm(temporary, { recursive: true, force: true });
  }
}
