import assert from "node:assert/strict";
import test from "node:test";

import { validateRepository } from "../../src/validate.js";

test("repository has no validation errors", async () => {
  const issues = await validateRepository(process.cwd());
  assert.deepEqual(issues.filter((issue) => issue.level === "error"), []);
});

