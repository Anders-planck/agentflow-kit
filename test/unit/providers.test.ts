import assert from "node:assert/strict";
import test from "node:test";

import { planContextMode } from "../../src/providers/context-mode.js";
import { planContext7 } from "../../src/providers/context7.js";
import { planSerena } from "../../src/providers/serena.js";
import type { ClientName, PlanItem } from "../../src/types.js";

const allClients = (enabled: boolean): Record<ClientName, boolean> => ({
  codex: enabled,
  claude: enabled,
  opencode: enabled,
});

test("provider planners leave complete and disabled configurations unchanged", () => {
  const contextModeItems: PlanItem[] = [];
  const contextModeText = '{"plugin":["context-mode"]}\n';
  assert.equal(planContextMode({
    items: contextModeItems,
    clients: allClients(true),
    codexConfig: '[marketplaces.context-mode]\n[plugins."context-mode@context-mode"]\n',
    claudeSettings: { enabledPlugins: { "context-mode@context-mode": true } },
    opencode: { plugin: ["context-mode", 42] },
    opencodeText: contextModeText,
  }), contextModeText);
  assert.deepEqual(contextModeItems, []);

  const context7Items: PlanItem[] = [];
  const context7Text = '{"mcp":{"context7":{"type":"remote","url":"https://mcp.context7.com/mcp","enabled":true}}}\n';
  assert.equal(planContext7({
    items: context7Items,
    clients: allClients(true),
    endpoint: "https://mcp.context7.com/mcp",
    codexConfig: "[mcp_servers.context7]\n",
    claudeState: { nested: { context7: true } },
    opencode: { mcp: { context7: { type: "remote", url: "https://mcp.context7.com/mcp", enabled: true } } },
    opencodeText: context7Text,
  }), context7Text);
  assert.deepEqual(context7Items, []);

  const disabledItems: PlanItem[] = [];
  assert.equal(planContext7({
    items: disabledItems,
    clients: allClients(false),
    endpoint: "https://mcp.context7.com/mcp",
    codexConfig: "",
    claudeState: {},
    opencode: {},
    opencodeText: "{}\n",
  }), "{}\n");
  assert.deepEqual(disabledItems, []);
});

test("provider planners emit only the missing client changes", () => {
  const originalPath = process.env.PATH;
  process.env.PATH = "";
  try {
    const contextModeItems: PlanItem[] = [];
    const contextModeText = planContextMode({
      items: contextModeItems,
      clients: allClients(true),
      codexConfig: "[marketplaces.context-mode]\n",
      claudeSettings: {},
      opencode: { plugin: ["other-plugin", 42] },
      opencodeText: '{"plugin":["other-plugin",42]}\n',
    });
    assert.deepEqual(contextModeItems.map((item) => item.id), [
      "codex-context-mode-plugin",
      "claude-context-mode-marketplace",
      "claude-context-mode-plugin",
    ]);
    assert.match(contextModeText, /context-mode/);

    const context7Items: PlanItem[] = [];
    const context7Text = planContext7({
      items: context7Items,
      clients: allClients(true),
      endpoint: "https://mcp.context7.com/mcp",
      codexConfig: "",
      claudeState: {},
      opencode: {},
      opencodeText: "{}\n",
    });
    assert.deepEqual(context7Items.map((item) => item.id), ["codex-context7", "claude-context7"]);
    assert.match(context7Text, /context7/);
  } finally {
    process.env.PATH = originalPath;
  }
});

test("Serena planner reports a missing launcher and supports both launch strategies", () => {
  const originalPath = process.env.PATH;
  process.env.PATH = "";
  try {
    const missingItems: PlanItem[] = [];
    assert.equal(planSerena({
      items: missingItems,
      clients: allClients(true),
      commit: "abc123",
      codexConfig: "",
      claudeState: {},
      opencode: {},
      opencodeText: "{}\n",
    }), "{}\n");
    assert.deepEqual(missingItems.map((item) => item.id), ["serena-missing"]);

    const uvxItems: PlanItem[] = [];
    const uvxText = planSerena({
      items: uvxItems,
      clients: allClients(true),
      commit: "abc123",
      codexConfig: "",
      claudeState: {},
      opencode: {},
      opencodeText: "{}\n",
      assumedExecutables: ["uvx"],
    });
    assert.deepEqual(uvxItems.map((item) => item.id), ["codex-serena", "claude-serena"]);
    assert.match(uvxText, /git\+https:\/\/github\.com\/oraios\/serena@abc123/);

    const existingText = '{"mcp":{"serena":true}}\n';
    const existingItems: PlanItem[] = [];
    const expected = {
      type: "local",
      command: ["uvx", "--from", "git+https://github.com/oraios/serena@abc123", "serena", "start-mcp-server", "--project-from-cwd", "--context=ide"],
      enabled: true,
      timeout: 20000,
    };
    assert.equal(planSerena({
      items: existingItems,
      clients: allClients(true),
      commit: "abc123",
      codexConfig: "[mcp_servers.serena]\n",
      claudeState: { nested: { serena: true } },
      opencode: { mcp: { serena: expected } },
      opencodeText: existingText,
      assumedExecutables: ["uvx"],
    }), existingText);
    assert.deepEqual(existingItems, []);

    const directItems: PlanItem[] = [];
    assert.equal(planSerena({
      items: directItems,
      clients: allClients(false),
      commit: "abc123",
      codexConfig: "",
      claudeState: {},
      opencode: {},
      opencodeText: "{}\n",
      assumedExecutables: ["serena", "uvx"],
    }), "{}\n");
    assert.deepEqual(directItems, []);
  } finally {
    process.env.PATH = originalPath;
  }
});
