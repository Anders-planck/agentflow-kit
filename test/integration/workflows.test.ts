import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { parse } from "yaml";

test("workflow registry covers the full engineering lifecycle", async () => {
  const workflows = parse(await readFile(join(process.cwd(), "registry", "workflows.yaml"), "utf8")) as {
    stages: Record<string, { routes: Array<{ skill: string }> }>;
  };
  for (const stage of ["setup", "discovery", "planning", "implementation", "diagnosis", "architecture", "verification", "handoff"]) {
    assert.ok(workflows.stages[stage]?.routes.length, `missing routes for ${stage}`);
  }
  assert.equal(workflows.stages.implementation?.routes.some((route) => route.skill === "serena-symbolic-code"), true);
  assert.equal(workflows.stages.implementation?.routes.some((route) => route.skill === "structural-code-search"), true);
});

