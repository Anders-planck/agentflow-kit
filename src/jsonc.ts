import { applyEdits, modify, parse, type ParseError } from "jsonc-parser";

export function parseJsonc<T>(content: string, source: string): T {
  const errors: ParseError[] = [];
  const parsed = parse(content || "{}", errors, { allowTrailingComma: true, disallowComments: false }) as T;
  if (errors.length) throw new Error(`Unable to parse ${source}: JSONC error ${errors[0]?.error}`);
  return parsed;
}

export function setJsoncValue(content: string, path: (string | number)[], value: unknown): string {
  const source = content.trim() ? content : "{}\n";
  const edits = modify(source, path, value, {
    formattingOptions: { insertSpaces: true, tabSize: 2, eol: "\n" },
  });
  return applyEdits(source, edits).replace(/\s*$/, "\n");
}

export function removeJsoncValue(content: string, path: (string | number)[]): string {
  return setJsoncValue(content, path, undefined);
}

