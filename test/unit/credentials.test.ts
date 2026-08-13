import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import test from "node:test";

import { ensureAgentScanToken, promptSecret, SNYK_ACCOUNT_URL } from "../../src/cli/credentials.js";

test("secret prompt returns the token without echoing it", async () => {
  const input = Object.assign(new PassThrough(), { isTTY: true });
  const output = Object.assign(new PassThrough(), { isTTY: true });
  let rendered = "";
  output.setEncoding("utf8");
  output.on("data", (chunk: string) => { rendered += chunk; });
  setImmediate(() => input.write("hidden-test-token\n"));

  assert.equal(await promptSecret("Secret: ", input, output), "hidden-test-token");
  assert.equal(rendered, "Secret: \n");
  assert.doesNotMatch(rendered, /hidden-test-token/);
});

test("secret prompt refuses to read from a non-interactive stream", async () => {
  const input = Object.assign(new PassThrough(), { isTTY: false });
  const output = Object.assign(new PassThrough(), { isTTY: true });
  assert.equal(await promptSecret("Secret: ", input, output), "");
  input.isTTY = true;
  output.isTTY = false;
  assert.equal(await promptSecret("Secret: ", input, output), "");
});

test("interactive full install explains Snyk setup and asks for a hidden runtime token", async () => {
  const environment: NodeJS.ProcessEnv = {};
  const messages: string[] = [];
  const prompts: string[] = [];

  const source = await ensureAgentScanToken({
    environment,
    interactive: true,
    write: (message) => messages.push(message),
    readSecret: async (question) => {
      prompts.push(question);
      return "runtime-only-token";
    },
  });

  assert.equal(source, "prompt");
  assert.equal(environment.SNYK_TOKEN, "runtime-only-token");
  assert.equal(prompts.length, 1);
  assert.match(prompts[0] ?? "", /input hidden/i);
  assert.ok(messages.join("\n").includes(SNYK_ACCOUNT_URL));
  assert.match(messages.join("\n"), /process only/i);
  assert.doesNotMatch(messages.join("\n"), /runtime-only-token/);
});

test("non-interactive full install gives complete token acquisition and runtime instructions", async () => {
  await assert.rejects(
    ensureAgentScanToken({ environment: {}, interactive: false }),
    (error: Error) => {
      assert.match(error.message, /SNYK_TOKEN/);
      assert.ok(error.message.includes(SNYK_ACCOUNT_URL));
      assert.match(error.message, /read -s SNYK_TOKEN/);
      assert.match(error.message, /orditra --preset full install/);
      return true;
    },
  );
});

test("an empty interactive token cancels with the same actionable instructions", async () => {
  const environment: NodeJS.ProcessEnv = {};
  await assert.rejects(
    ensureAgentScanToken({
      environment,
      interactive: true,
      write: () => undefined,
      readSecret: async () => "   ",
    }),
    /read -s SNYK_TOKEN/,
  );
  assert.equal(environment.SNYK_TOKEN, undefined);
});

test("an environment token bypasses the interactive prompt", async () => {
  let prompted = false;
  const source = await ensureAgentScanToken({
    environment: { SNYK_TOKEN: "already-configured" },
    interactive: true,
    readSecret: async () => {
      prompted = true;
      return "unexpected";
    },
  });
  assert.equal(source, "environment");
  assert.equal(prompted, false);
});
