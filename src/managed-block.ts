const HTML_START = "<!-- orditra:start -->";
const HTML_END = "<!-- orditra:end -->";
const LEGACY_HTML_START = "<!-- agentflow-kit:start -->";
const LEGACY_HTML_END = "<!-- agentflow-kit:end -->";

export function upsertMarkdownBlock(original: string, block: string): string {
  const migrated = removeBlock(original, LEGACY_HTML_START, LEGACY_HTML_END);
  return upsertBlock(migrated, block.trim(), HTML_START, HTML_END);
}

export function removeMarkdownBlock(original: string): string {
  return removeBlock(removeBlock(original, HTML_START, HTML_END), LEGACY_HTML_START, LEGACY_HTML_END);
}

function upsertBlock(original: string, block: string, start: string, end: string): string {
  const normalized = original.replace(/\r\n/g, "\n").trimEnd();
  const managed = `${start}\n${block}\n${end}`;
  const startIndex = normalized.indexOf(start);
  const endIndex = normalized.indexOf(end);
  if (startIndex >= 0 && endIndex > startIndex) {
    const before = normalized.slice(0, startIndex).trimEnd();
    const after = normalized.slice(endIndex + end.length).trimStart();
    return [before, managed, after].filter(Boolean).join("\n\n") + "\n";
  }
  return [normalized, managed].filter(Boolean).join("\n\n") + "\n";
}

function removeBlock(original: string, start: string, end: string): string {
  const normalized = original.replace(/\r\n/g, "\n");
  const startIndex = normalized.indexOf(start);
  const endIndex = normalized.indexOf(end);
  if (startIndex < 0 || endIndex <= startIndex) return original;
  const before = normalized.slice(0, startIndex).trimEnd();
  const after = normalized.slice(endIndex + end.length).trimStart();
  return [before, after].filter(Boolean).join("\n\n") + (before || after ? "\n" : "");
}
