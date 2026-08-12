import assert from "node:assert/strict";
import { join } from "node:path";
import test from "node:test";

import { resolveAppPaths } from "../../src/paths.js";

test("XDG paths are honored", () => {
  const paths = resolveAppPaths("/home/example", { XDG_CONFIG_HOME: "/cfg", XDG_DATA_HOME: "/data", XDG_STATE_HOME: "/state" });
  assert.equal(paths.appConfigDir, join("/cfg", "orditra"));
  assert.equal(paths.appDataDir, join("/data", "orditra"));
  assert.equal(paths.appStateDir, join("/state", "orditra"));
});

test("portable mode keeps all mutable state under one root", () => {
  const paths = resolveAppPaths("/home/example", { ORDITRA_PORTABLE_HOME: "/portable" });
  assert.equal(paths.appConfigDir, join("/portable", "config", "orditra"));
  assert.equal(paths.appDataDir, join("/portable", "data", "orditra"));
  assert.equal(paths.appStateDir, join("/portable", "state", "orditra"));
});
