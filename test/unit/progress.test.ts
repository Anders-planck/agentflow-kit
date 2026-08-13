import assert from "node:assert/strict";
import test from "node:test";

import { cliErrorWasReported, createProgressFlow, markCliErrorReported, renderProgressBar } from "../../src/cli/progress.js";

test("progress error reporting marks only Error objects", () => {
  const error = new Error("already shown");
  assert.equal(cliErrorWasReported(error), false);
  markCliErrorReported(error);
  assert.equal(cliErrorWasReported(error), true);
  markCliErrorReported("plain failure");
  assert.equal(cliErrorWasReported("plain failure"), false);
});

test("progress bars clamp values and render a stable percentage", () => {
  assert.equal(renderProgressBar(0, 4, 10), "░░░░░░░░░░   0%");
  assert.equal(renderProgressBar(2, 4, 10), "█████░░░░░  50%");
  assert.equal(renderProgressBar(9, 4, 10), "██████████ 100%");
  assert.equal(renderProgressBar(0, 0, 10), "██████████ 100%");
});

test("human progress flow is clear in non-interactive logs", () => {
  let output = "";
  const stream = { isTTY: false, write(chunk: string) { output += chunk; return true; } };
  const flow = createProgressFlow("Install", true, stream);

  flow.start("Preset full · 26 capabilities");
  flow.stage("Dependencies");
  flow.update(1, 2, "Installed Probe");
  flow.succeed("Dependencies ready");
  flow.finish("Configuration applied with a reversible backup");

  assert.match(output, /╭─ Orditra · Install/);
  assert.match(output, /├─ Dependencies/);
  assert.match(output, /██████████░░░░░░░░░░\s+50%/);
  assert.match(output, /Installed Probe/);
  assert.match(output, /╰─ ✓ Configuration applied with a reversible backup/);
});

test("disabled progress flow preserves machine-readable output", () => {
  let output = "";
  const stream = { isTTY: true, write(chunk: string) { output += chunk; return true; } };
  const flow = createProgressFlow("Update", false, stream);
  flow.start();
  flow.stage("Plan");
  flow.update(1, 1, "Done");
  flow.succeed("Ready");
  flow.finish("Complete");
  assert.equal(output, "");
});
