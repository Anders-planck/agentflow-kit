import assert from "node:assert/strict";
import test from "node:test";

import { runCommand } from "../../src/commands.js";

test("commands return structured output", () => {
  const result = runCommand({ command: process.execPath, args: ["-e", "process.stdout.write('ok')"] });
  assert.equal(result.status, 0);
  assert.equal(result.stdout, "ok");
  assert.ok(result.durationMs >= 0);
});

test("command errors redact common token forms", () => {
  const token = ["ghp", "abcdefghijklmnopqrstuvwxyz123456"].join("_");
  assert.throws(
    () => runCommand({ command: process.execPath, args: ["-e", "process.stderr.write('token=' + ['ghp','abcdefghijklmnopqrstuvwxyz123456'].join('_'));process.exit(2)"] }),
    (error: unknown) => /\[REDACTED\]/.test((error as Error).message) && !(error as Error).message.includes(token),
  );
});
