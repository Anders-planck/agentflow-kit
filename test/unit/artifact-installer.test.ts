import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { installVerifiedArtifact } from "../../src/artifact-installer.js";
import { findExecutable, runCommand } from "../../src/commands.js";

test("verified release artifacts install one executable atomically", async () => {
  const root = await mkdtemp(join(tmpdir(), "orditra-artifact-test-"));
  const originalFetch = globalThis.fetch;
  try {
    const source = join(root, "source");
    const archive = join(root, "artifact.tar.gz");
    const target = join(root, "target", "scip");
    await mkdir(source);
    await writeFile(join(source, "scip"), "verified executable", "utf8");
    await chmod(join(source, "scip"), 0o755);
    const tar = findExecutable("tar");
    assert.ok(tar);
    runCommand({ command: tar, args: ["-czf", archive, "-C", source, "scip"] });
    const payload = await readFile(archive);
    const sha256 = createHash("sha256").update(payload).digest("hex");
    globalThis.fetch = async () => new Response(payload, {
      status: 200,
      headers: { "content-length": String(payload.byteLength) },
    });

    await installVerifiedArtifact({
      kind: "artifact",
      url: "https://example.test/scip.tar.gz",
      sha256,
      archive: "tar.gz",
      executable: "scip",
      target,
      extractor: tar,
    });

    assert.equal(await readFile(target, "utf8"), "verified executable");
    assert.equal((await stat(target)).mode & 0o777, 0o755);
  } finally {
    globalThis.fetch = originalFetch;
    await rm(root, { recursive: true, force: true });
  }
});

test("release artifacts fail closed on checksum mismatch", async () => {
  const root = await mkdtemp(join(tmpdir(), "orditra-artifact-checksum-"));
  const originalFetch = globalThis.fetch;
  try {
    const tar = findExecutable("tar");
    assert.ok(tar);
    globalThis.fetch = async () => new Response(Buffer.from("untrusted"), { status: 200 });
    const target = join(root, "target", "scip");
    await assert.rejects(installVerifiedArtifact({
      kind: "artifact",
      url: "https://example.test/scip.tar.gz",
      sha256: "0".repeat(64),
      archive: "tar.gz",
      executable: "scip",
      target,
      extractor: tar,
    }), /checksum mismatch/);
    await assert.rejects(stat(target), { code: "ENOENT" });
  } finally {
    globalThis.fetch = originalFetch;
    await rm(root, { recursive: true, force: true });
  }
});

test("release artifacts reject insecure transport and unsafe responses", async () => {
  const originalFetch = globalThis.fetch;
  const tar = findExecutable("tar");
  assert.ok(tar);
  const spec = {
    kind: "artifact" as const,
    url: "https://example.test/scip.tar.gz",
    sha256: "0".repeat(64),
    archive: "tar.gz" as const,
    executable: "scip",
    target: join(tmpdir(), "orditra-artifact-policy-target", "scip"),
    extractor: tar,
  };

  try {
    await assert.rejects(installVerifiedArtifact({
      ...spec,
      url: "http://example.test/scip.tar.gz",
    }), /must use HTTPS/);

    globalThis.fetch = async () => new Response(null, { status: 503 });
    await assert.rejects(installVerifiedArtifact(spec), /HTTP 503/);

    globalThis.fetch = async () => {
      const response = new Response(Buffer.from("redirected"), { status: 200 });
      Object.defineProperty(response, "url", { value: "http://example.test/scip.tar.gz" });
      return response;
    };
    await assert.rejects(installVerifiedArtifact(spec), /redirected away from HTTPS/);

    globalThis.fetch = async () => new Response(null, {
      status: 200,
      headers: { "content-length": String(256 * 1024 * 1024 + 1) },
    });
    await assert.rejects(installVerifiedArtifact(spec), /exceeds 268435456 bytes/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
