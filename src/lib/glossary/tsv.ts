// Glossary entry helpers shared by the server and the browser.

export const MAX_TERM_BYTES = 1024;

export interface GlossaryEntry {
  source: string;
  target: string;
}

export type EntryField = "source" | "target";

export type EntryIssueKind = "empty" | "whitespace" | "control" | "too_long" | "duplicate";

export interface EntryIssue {
  row: number;
  field: EntryField;
  kind: EntryIssueKind;
  message: string;
}

const encoder = new TextEncoder();

export function utf8Bytes(value: string): number {
  return encoder.encode(value).length;
}

/** Parses DeepL's TSV (`source\ttarget` per line). Blank lines and lines without a tab are skipped. */
export function parseTsv(tsv: string): GlossaryEntry[] {
  const entries: GlossaryEntry[] = [];
  for (const line of tsv.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const tab = line.indexOf("\t");
    if (tab === -1) continue;
    entries.push({ source: line.slice(0, tab).trim(), target: line.slice(tab + 1).trim() });
  }
  return entries;
}

/** Serializes entries to TSV, trimmed and sorted by source for stable diffs. */
export function serializeTsv(entries: GlossaryEntry[], { sort = true } = {}): string {
  const rows = entries.map((e) => ({ source: e.source.trim(), target: e.target.trim() }));
  if (sort) rows.sort((a, b) => a.source.localeCompare(b.source) || a.target.localeCompare(b.target));
  return rows.map((e) => `${e.source}\t${e.target}`).join("\n");
}

function termIssue(value: string, row: number, field: EntryField): EntryIssue | undefined {
  const label = field === "source" ? "Source" : "Target";
  if (!value.trim()) return { row, field, kind: "empty", message: `${label} term is empty` };
  if (/[\t\r\n]/.test(value))
    return { row, field, kind: "control", message: `${label} term contains a tab or line break` };
  if (value !== value.trim())
    return { row, field, kind: "whitespace", message: `${label} term has leading or trailing whitespace` };
  if (utf8Bytes(value) > MAX_TERM_BYTES)
    return { row, field, kind: "too_long", message: `${label} term is longer than ${MAX_TERM_BYTES} bytes` };
  return undefined;
}

/**
 * Validates entries against DeepL's rules and returns every issue found, per row and field.
 * Whitespace is reported, so callers that auto-trim should trim before validating.
 */
export function validateEntries(entries: GlossaryEntry[]): EntryIssue[] {
  const issues: EntryIssue[] = [];
  const firstRowBySource = new Map<string, number>();

  entries.forEach((entry, row) => {
    const source = termIssue(entry.source, row, "source");
    const target = termIssue(entry.target, row, "target");
    if (source) issues.push(source);
    if (target) issues.push(target);

    const key = entry.source.trim();
    if (!key) return;
    const first = firstRowBySource.get(key);
    if (first === undefined) firstRowBySource.set(key, row);
    else
      issues.push({
        row,
        field: "source",
        kind: "duplicate",
        message: `Duplicate source term (also in row ${first + 1})`,
      });
  });

  return issues;
}

/** Trims both sides of every entry. */
export function trimEntries(entries: GlossaryEntry[]): GlossaryEntry[] {
  return entries.map((e) => ({ source: e.source.trim(), target: e.target.trim() }));
}
