import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

function runCli(args: string[], home?: string, environment: NodeJS.ProcessEnv = {}): string {
  return execFileSync(process.execPath, ["dist/src/cli.js", ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      ...(home ? { ORDITRA_PORTABLE_HOME: join(home, ".orditra-portable") } : {}),
      ...environment,
    },
  });
}

function runCliWithFindings(args: string[], home?: string): string {
  const result = spawnSync(process.execPath, ["dist/src/cli.js", ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      ...(home ? { ORDITRA_PORTABLE_HOME: join(home, ".orditra-portable") } : {}),
    },
  });
  if (result.error) throw result.error;
  return result.stdout;
}

test("CLI exposes schema-driven commands and machine-readable maps", () => {
  const help = runCli(["--help"]);
  for (const command of ["install", "update", "diff", "init", "doctor", "report", "map", "rollback", "uninstall", "gc", "project", "config", "skills", "validate", "version"]) {
    assert.match(help, new RegExp(`\\b${command}\\b`));
  }
  assert.match(runCli(["project", "--help"]), /init.*diff.*sync/s);
  assert.match(runCli(["config", "--help"]), /explain.*migrate/s);
  const map = JSON.parse(runCli(["--json", "--dir", "src", "map"])) as { totalFiles: number };
  assert.ok(map.totalFiles > 0);
});

test("CLI preserves command and flag version surfaces", () => {
  const expected = (JSON.parse(readFileSync("package.json", "utf8")) as { version: string }).version;
  for (const args of [["version"], ["v"], ["--version"], ["-V"]]) {
    assert.equal(runCli(args).trim(), expected);
  }
});

test("install dry-run reports active dependency provenance and skips registered providers without mutating", async () => {
  const home = await mkdtemp(join(tmpdir(), "orditra-cli-dependencies-"));
  try {
    const output = runCli([
      "--home", home,
      "--preset", "recommended",
      "--dry-run",
      "--json",
      "install",
    ], home);
    const plan = JSON.parse(output) as { dependencies: Array<{ name: string; source: string; requiredBy: string[] }> };
    assert.ok(plan.dependencies.some((item) => item.name === "ast-grep" && item.source === "https://github.com/ast-grep/ast-grep"));
    assert.equal(plan.dependencies.some((item) => item.requiredBy.includes("agent-supply-chain")), false);
  } finally { await rm(home, { recursive: true, force: true }); }
});

test("full install preflight prefers the Homebrew zizmor package on macOS", async () => {
  const home = await mkdtemp(join(tmpdir(), "orditra-cli-zizmor-home-"));
  const bin = await mkdtemp(join(tmpdir(), "orditra-cli-zizmor-bin-"));
  try {
    for (const executable of ["brew", "cargo"]) {
      const target = join(bin, executable);
      await writeFile(target, "#!/bin/sh\nexit 0\n", "utf8");
      await chmod(target, 0o755);
    }
    const output = runCli([
      "--home", home,
      "--preset", "full",
      "--dry-run",
      "--json",
      "install",
    ], home, { PATH: bin });
    const plan = JSON.parse(output) as { dependencies: Array<{ name: string; spec?: { command: string; args: string[] } }> };
    const zizmor = plan.dependencies.find((item) => item.name === "zizmor");
    assert.equal(zizmor?.spec?.command, join(bin, "brew"));
    assert.deepEqual(zizmor?.spec?.args, ["install", "zizmor"]);
  } finally {
    await rm(home, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});

test("full install preflight rejects an incompatible Rust toolchain before mutation", async () => {
  const home = await mkdtemp(join(tmpdir(), "orditra-cli-rust-home-"));
  const bin = await mkdtemp(join(tmpdir(), "orditra-cli-rust-bin-"));
  try {
    const cargo = join(bin, "cargo");
    const rustc = join(bin, "rustc");
    await writeFile(cargo, "#!/bin/sh\nexit 0\n", "utf8");
    await writeFile(rustc, "#!/bin/sh\necho 'rustc 1.94.0 (test)'\n", "utf8");
    await chmod(cargo, 0o755);
    await chmod(rustc, 0o755);
    const output = runCli([
      "--home", home,
      "--preset", "full",
      "--dry-run",
      "--json",
      "install",
    ], home, { PATH: bin });
    const plan = JSON.parse(output) as {
      dependencies: Array<{ name: string; status: string; remediation?: string }>;
    };
    const zizmor = plan.dependencies.find((item) => item.name === "zizmor");
    assert.equal(zizmor?.status, "unresolved");
    assert.match(zizmor?.remediation ?? "", /rustc 1\.94\.0.*requires >= 1\.97\.0/i);
  } finally {
    await rm(home, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
  }
});

test("doctor honors an explicit full preset", async () => {
  const home = await mkdtemp(join(tmpdir(), "orditra-cli-doctor-full-"));
  try {
    const checks = JSON.parse(runCliWithFindings(["--home", home, "--preset", "full", "--json", "doctor"], home)) as Array<{ id: string }>;
    assert.ok(checks.some((check) => check.id === "dependency-repomix"));
    assert.ok(checks.some((check) => check.id === "dependency-agent-scan"));
  } finally { await rm(home, { recursive: true, force: true }); }
});

test("full install fails before dependency mutation when required credentials are missing", async () => {
  const home = await mkdtemp(join(tmpdir(), "orditra-cli-full-credentials-"));
  try {
    const environment: NodeJS.ProcessEnv = { ...process.env, PATH: "", ORDITRA_PORTABLE_HOME: join(home, ".orditra-portable") };
    delete environment.SNYK_TOKEN;
    const result = spawnSync(process.execPath, ["dist/src/cli.js", "--home", home, "--preset", "full", "--yes", "install"], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: environment,
    });
    assert.equal(result.status, 1);
    const output = `${result.stdout}\n${result.stderr}`;
    assert.match(output, /SNYK_TOKEN.*app\.snyk\.io\/account.*read -s SNYK_TOKEN.*orditra --preset full install/s);
    assert.equal((output.match(/Agent Scan requires SNYK_TOKEN\./g) ?? []).length, 1);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("CLI configuration, skill, and project commands expose portable behavior", async () => {
  const home = await mkdtemp(join(tmpdir(), "orditra-cli-config-"));
  const project = await mkdtemp(join(tmpdir(), "orditra-cli-project-"));
  try {
    const common = ["--home", home, "--preset", "minimal", "--json"];
    assert.equal((JSON.parse(runCli([...common, "init"], home)) as { action: string }).action, "created");
    assert.equal((JSON.parse(runCli([...common, "init"], home)) as { action: string }).action, "preserve");

    const explanation = JSON.parse(runCli([...common, "config", "explain"], home)) as Array<{ id: string }>;
    assert.ok(explanation.some((finding) => finding.id === "workflow-core"));
    assert.equal((JSON.parse(runCli([...common, "config", "migrate"], home)) as { action: string }).action, "unchanged");
    assert.equal((JSON.parse(runCli([...common, "skills", "explain", "workflow-router"], home)) as { source: string }).source, "bundled");

    const projectArgs = [...common, "--dir", project, "project", "sync"];
    assert.equal((JSON.parse(runCli(projectArgs, home)) as { action: string }).action, "create");
    assert.equal((JSON.parse(runCli(projectArgs, home)) as { action: string }).action, "unchanged");
  } finally {
    await rm(home, { recursive: true, force: true });
    await rm(project, { recursive: true, force: true });
  }
});

test("CLI installation, diagnostics, and lifecycle operate through public commands", async () => {
  const home = await mkdtemp(join(tmpdir(), "orditra-cli-lifecycle-"));
  try {
    const common = ["--home", home, "--preset", "minimal", "--skip-external", "--skip-dependencies"];
    assert.match(runCli([...common, "--yes", "install"], home), /Applied with backup:/);

    const doctor = JSON.parse(runCli([...common, "--json", "doctor"], home)) as Array<{ id: string }>;
    assert.ok(doctor.some((finding) => finding.id === "transaction-recovery"));
    const report = JSON.parse(runCli([...common, "--json", "report"], home)) as Array<{ capability: string }>;
    assert.ok(report.some((finding) => finding.capability === "installer"));

    assert.equal((JSON.parse(runCli([...common, "--dry-run", "--json", "rollback"], home)) as { preset: string }).preset, "minimal");
    assert.equal((JSON.parse(runCli([...common, "--dry-run", "--json", "uninstall"], home)) as unknown[]).length, 1);
    assert.ok(Array.isArray((JSON.parse(runCli([...common, "--dry-run", "--json", "gc"], home)) as { retainedReleases: string[] }).retainedReleases));
    assert.match(runCli([...common, "--yes", "rollback"], home), /Restored/);
  } finally { await rm(home, { recursive: true, force: true }); }
});

test("CLI terminal dry-run renders planned dependency and skill operations", async () => {
  const home = await mkdtemp(join(tmpdir(), "orditra-cli-preview-"));
  try {
    const output = runCli(["--home", home, "--preset", "recommended", "--dry-run", "--skip-dependencies", "install"], home);
    assert.match(output, /Preset: recommended/);
    assert.match(output, /FETCH\s+mattpocock\/mattpocock-core/);
  } finally { await rm(home, { recursive: true, force: true }); }
});
