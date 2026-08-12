import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";

import { createCliProgram, globalOptions } from "../../src/cli/options.js";

function options(args: string[]) {
  const program = createCliProgram("1.0.0", process.cwd());
  program.parse(args, { from: "user" });
  return globalOptions(program);
}

test("global CLI options normalize defaults and explicit portable flags", () => {
  const defaults = options([]);
  assert.equal(defaults.format, "terminal");
  assert.equal(defaults.budget, 2000);
  assert.equal(defaults.dryRun, false);
  assert.equal(defaults.preset, undefined);
  assert.equal(defaults.output, undefined);

  const explicit = options([
    "--home", ".",
    "--root", ".",
    "--preset", "full",
    "--json",
    "--format", "markdown",
    "--output", "report.json",
    "--budget", "321",
    "--dry-run",
    "--yes",
    "--skip-external",
    "--skip-dependencies",
    "--adopt-existing",
  ]);
  assert.deepEqual(explicit, {
    home: resolve("."),
    root: resolve("."),
    dryRun: true,
    json: true,
    yes: true,
    skipExternal: true,
    skipDependencies: true,
    adoptExisting: true,
    format: "json",
    budget: 321,
    preset: "full",
    output: resolve("report.json"),
  });

  assert.equal(options(["--format", "markdown"]).format, "markdown");
});

test("global CLI options reject non-numeric and non-positive map budgets", () => {
  for (const budget of ["not-a-number", "0", "-1"]) {
    const program = createCliProgram("1.0.0", process.cwd());
    program.parse(["--budget", budget], { from: "user" });
    assert.throws(() => globalOptions(program), /--budget must be a positive integer/);
  }
});
