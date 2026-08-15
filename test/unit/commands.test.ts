import assert from "node:assert/strict";
import test from "node:test";

import { formatCommand, runCommand } from "../../src/commands.js";

test("commands return structured output", () => {
  const result = runCommand({ command: process.execPath, args: ["-e", "process.stdout.write('ok')"] });
  assert.equal(result.status, 0);
  assert.equal(result.stdout, "ok");
  assert.ok(result.durationMs >= 0);
});

test("commands apply their declared environment without replacing the process environment", () => {
  const result = runCommand({
    command: process.execPath,
    args: ["-e", "process.stdout.write(process.env.ORDITRA_TEST_EXPERIMENT ?? '')"],
    environment: { ORDITRA_TEST_EXPERIMENT: "enabled" },
  });
  assert.equal(result.stdout, "enabled");
});

test("formatted commands show required non-secret environment", () => {
  assert.equal(formatCommand({
    command: "go",
    args: ["install", "github.com/aquasecurity/trivy/cmd/trivy@v0.74.0"],
    environment: { GOEXPERIMENT: "jsonv2" },
  }), "GOEXPERIMENT=jsonv2 go install github.com/aquasecurity/trivy/cmd/trivy@v0.74.0");
});

test("formatted commands redact secret environment values", () => {
  const token = "sensitive-runtime-value";
  const formatted = formatCommand({ command: "scanner", args: [], environment: { SNYK_TOKEN: token } });
  assert.match(formatted, /SNYK_TOKEN='\[REDACTED\]'/);
  assert.equal(formatted.includes(token), false);
});

test("command errors redact common token forms", () => {
  const token = ["ghp", "abcdefghijklmnopqrstuvwxyz123456"].join("_");
  assert.throws(
    () => runCommand({ command: process.execPath, args: ["-e", "process.stderr.write('token=' + ['ghp','abcdefghijklmnopqrstuvwxyz123456'].join('_'));process.exit(2)"] }),
    (error: unknown) => /\[REDACTED\]/.test((error as Error).message) && !(error as Error).message.includes(token),
  );
});
