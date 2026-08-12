import assert from "node:assert/strict";
import test from "node:test";

import { renderFindings } from "../../src/reporting.js";
import type { Finding } from "../../src/types.js";

const findings: Finding[] = [
  { id: "ok", capability: "tests", status: "pass", summary: "All checks passed" },
  { id: "unsafe", capability: "security", status: "warning", summary: "Review <hook>", remediation: "Disable it" },
];

test("all report formats derive from structured findings", () => {
  assert.equal(JSON.parse(renderFindings(findings, "json")).length, 2);
  assert.match(renderFindings(findings, "markdown"), /\| warning \| security \|/);
  assert.equal(JSON.parse(renderFindings(findings, "sarif")).runs[0].results[0].level, "warning");
  assert.match(renderFindings(findings, "html"), /Review &lt;hook&gt;/);
  assert.match(renderFindings(findings, "terminal"), /\[WARNING\]/);
});
