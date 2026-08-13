import { Writable } from "node:stream";
import { createInterface } from "node:readline/promises";

export const SNYK_ACCOUNT_URL = "https://app.snyk.io/account";

export interface AgentScanCredentialOptions {
  environment?: NodeJS.ProcessEnv;
  interactive?: boolean;
  write?: (message: string) => void;
  readSecret?: (question: string) => Promise<string>;
}

export type CredentialSource = "environment" | "prompt";

export function snykTokenInstructions(): string {
  return [
    "Agent Scan requires SNYK_TOKEN.",
    `Create or sign in to Snyk, then reveal API Token → KEY at ${SNYK_ACCOUNT_URL}.`,
    "For a non-interactive runtime, load it without putting the secret in shell history:",
    "  read -s SNYK_TOKEN",
    "  export SNYK_TOKEN",
    "  orditra --preset full install",
    "Never commit the token or add it to an Orditra configuration file.",
  ].join("\n");
}

export async function promptSecret(
  question: string,
  input: NodeJS.ReadableStream & { isTTY?: boolean } = process.stdin,
  output: NodeJS.WritableStream & { isTTY?: boolean } = process.stdout,
): Promise<string> {
  if (!input.isTTY || !output.isTTY) return "";
  output.write(question);
  const muted = new Writable({ write(_chunk, _encoding, callback) { callback(); } });
  const prompt = createInterface({ input, output: muted, terminal: true });
  try {
    return (await prompt.question("")).trim();
  } finally {
    prompt.close();
    output.write("\n");
  }
}

export async function ensureAgentScanToken(options: AgentScanCredentialOptions = {}): Promise<CredentialSource> {
  const environment = options.environment ?? process.env;
  if (environment.SNYK_TOKEN?.trim()) return "environment";

  const interactive = options.interactive ?? Boolean(process.stdin.isTTY && process.stdout.isTTY);
  if (!interactive) throw new Error(snykTokenInstructions());

  const write = options.write ?? ((message: string) => console.log(message));
  write("Snyk Agent Scan requires a personal API token.");
  write(`Create or sign in, then reveal API Token → KEY: ${SNYK_ACCOUNT_URL}`);
  write("The token is loaded into this Orditra process only; it is never saved to config, output, or the repository.");
  const token = await (options.readSecret ?? promptSecret)("│ Paste SNYK_TOKEN (input hidden; Enter cancels): ");
  if (!token.trim()) throw new Error(snykTokenInstructions());
  environment.SNYK_TOKEN = token.trim();
  write("SNYK_TOKEN loaded for this process only.");
  return "prompt";
}
