import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import type { Finding, ReportFormat } from "./types.js";

const ORDER: Record<Finding["status"], number> = { error: 0, warning: 1, info: 2, pass: 3 };

export function sortFindings(findings: Finding[]): Finding[] {
  return [...findings].sort((a, b) => ORDER[a.status] - ORDER[b.status] || a.capability.localeCompare(b.capability) || a.id.localeCompare(b.id));
}

function markdownCell(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", "<br>");
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function terminal(findings: Finding[]): string {
  return sortFindings(findings).map((finding) => {
    const remediation = finding.remediation ? ` — ${finding.remediation}` : "";
    return `[${finding.status.toUpperCase().padEnd(7)}] ${finding.capability}/${finding.id}: ${finding.summary}${remediation}`;
  }).join("\n");
}

function markdown(findings: Finding[]): string {
  const rows = sortFindings(findings).map((finding) =>
    `| ${finding.status} | ${markdownCell(finding.capability)} | ${markdownCell(finding.summary)} | ${markdownCell(finding.remediation ?? "")} |`,
  );
  const counts = Object.fromEntries((["pass", "info", "warning", "error"] as const).map((status) => [status, findings.filter((item) => item.status === status).length]));
  return `# Orditra report\n\n` +
    `Pass: ${counts.pass} · Info: ${counts.info} · Warnings: ${counts.warning} · Errors: ${counts.error}\n\n` +
    `| Status | Capability | Finding | Remediation |\n| --- | --- | --- | --- |\n${rows.join("\n")}\n`;
}

function sarif(findings: Finding[]): string {
  const relevant = sortFindings(findings).filter((finding) => finding.status !== "pass");
  const rules = relevant.map((finding) => ({
    id: finding.id,
    shortDescription: { text: finding.summary },
    help: finding.remediation ? { text: finding.remediation } : undefined,
    properties: { capability: finding.capability },
  }));
  const results = relevant.map((finding) => ({
    ruleId: finding.id,
    level: finding.status === "error" ? "error" : finding.status === "warning" ? "warning" : "note",
    message: { text: finding.summary },
    ...(finding.source ? { locations: [{ physicalLocation: { artifactLocation: { uri: finding.source } } }] } : {}),
  }));
  return `${JSON.stringify({
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    version: "2.1.0",
    runs: [{ tool: { driver: { name: "Orditra", informationUri: "https://github.com/Anders-planck/orditra", rules } }, results }],
  }, null, 2)}\n`;
}

function html(findings: Finding[]): string {
  const rows = sortFindings(findings).map((finding) => `<tr data-status="${finding.status}"><td>${finding.status}</td><td>${escapeHtml(finding.capability)}</td><td>${escapeHtml(finding.summary)}</td><td>${escapeHtml(finding.remediation ?? "")}</td></tr>`).join("");
  return `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Orditra report</title><style>body{font:15px system-ui;margin:2rem;color:#18212f;background:#f7f8fa}main{max-width:1100px;margin:auto;background:white;padding:1.5rem;border-radius:12px;box-shadow:0 2px 16px #0001}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:.65rem;border-bottom:1px solid #dde2e8}tr[data-status=error]{background:#fff0f0}tr[data-status=warning]{background:#fff9e8}tr[data-status=pass]{color:#276749}code{background:#eef1f5;padding:.1rem .3rem;border-radius:4px}</style></head><body><main><h1>Orditra report</h1><p>Generated locally. No remote assets or telemetry.</p><table><thead><tr><th>Status</th><th>Capability</th><th>Finding</th><th>Remediation</th></tr></thead><tbody>${rows}</tbody></table></main></body></html>\n`;
}

export function renderFindings(findings: Finding[], format: ReportFormat): string {
  if (format === "json") return `${JSON.stringify(sortFindings(findings), null, 2)}\n`;
  if (format === "markdown") return markdown(findings);
  if (format === "sarif") return sarif(findings);
  if (format === "html") return html(findings);
  return `${terminal(findings)}${findings.length ? "\n" : ""}`;
}

export async function outputFindings(findings: Finding[], format: ReportFormat, output?: string): Promise<string> {
  const rendered = renderFindings(findings, format);
  if (!output) return rendered;
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, rendered, "utf8");
  return output;
}
