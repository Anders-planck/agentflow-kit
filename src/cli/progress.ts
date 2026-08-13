export interface ProgressOutput {
  isTTY?: boolean;
  columns?: number;
  write(chunk: string): unknown;
}

export interface ProgressFlow {
  start(detail?: string): void;
  stage(label: string): void;
  update(completed: number, total: number, label: string): void;
  info(message: string): void;
  succeed(message: string): void;
  finish(message: string): void;
  fail(message: string): void;
}

const reportedErrors = new WeakSet<object>();

export function markCliErrorReported(error: unknown): void {
  if (typeof error === "object" && error !== null) reportedErrors.add(error);
}

export function cliErrorWasReported(error: unknown): boolean {
  return typeof error === "object" && error !== null && reportedErrors.has(error);
}

export function renderProgressBar(completed: number, total: number, width = 20): string {
  const safeWidth = Math.max(1, Math.floor(width));
  const ratio = total <= 0 ? 1 : Math.min(1, Math.max(0, completed / total));
  const filled = Math.round(ratio * safeWidth);
  const percentage = Math.round(ratio * 100).toString().padStart(3);
  return `${"█".repeat(filled)}${"░".repeat(safeWidth - filled)} ${percentage}%`;
}

export function createProgressFlow(
  operation: string,
  enabled: boolean,
  stream: ProgressOutput = process.stdout,
): ProgressFlow {
  const interactive = Boolean(stream.isTTY);
  const color = interactive && !process.env.NO_COLOR;
  let dynamicLine = false;
  const cyan = (value: string): string => color ? `\u001b[36m${value}\u001b[0m` : value;
  const green = (value: string): string => color ? `\u001b[32m${value}\u001b[0m` : value;
  const red = (value: string): string => color ? `\u001b[31m${value}\u001b[0m` : value;
  const clearDynamic = (): void => {
    if (!enabled || !dynamicLine) return;
    stream.write(interactive ? "\r\u001b[2K" : "\n");
    dynamicLine = false;
  };
  const line = (value: string): void => {
    if (!enabled) return;
    clearDynamic();
    stream.write(`${value}\n`);
  };
  const compact = (value: string): string => {
    const limit = Math.max(24, (stream.columns ?? 100) - 39);
    return value.length > limit ? `${value.slice(0, limit - 1)}…` : value;
  };

  return {
    start(detail) {
      if (!enabled) return;
      line(`${cyan("╭─")} Orditra · ${operation}`);
      if (detail) line(`${cyan("│")} ${detail}`);
    },
    stage(label) { line(`${cyan("├─")} ${label}`); },
    update(completed, total, label) {
      if (!enabled) return;
      const counter = total > 0 ? `${Math.min(Math.max(0, completed), total)}/${total}` : "0/0";
      const rendered = `${cyan("│")} ${renderProgressBar(completed, total)} ${counter.padStart(7)}  ${compact(label)}`;
      if (interactive) {
        stream.write(`\r\u001b[2K${rendered}`);
        dynamicLine = true;
      } else {
        stream.write(`${rendered}\n`);
      }
    },
    info(message) { line(`${cyan("│")} ${message}`); },
    succeed(message) { line(`${cyan("│")} ${green("✓")} ${message}`); },
    finish(message) { line(`${cyan("╰─")} ${green("✓")} ${message}`); },
    fail(message) { line(`${cyan("╰─")} ${red("✗")} ${message}`); },
  };
}
