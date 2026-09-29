/** DeepL's own requirement for this app: at least 5,000 characters per request. */
export const MIN_TEXT_CHARS = 5_000;
export const DEFAULT_MAX_TEXT_CHARS = 30_000;

/** UTF-8 bytes of `text + context`. Keeps us below DeepL's 128 KiB request limit. */
export const MAX_REQUEST_BYTES = 120 * 1024;

export const MAX_CONTEXT_CHARS = 4_000;
export const MAX_GLOSSARY_NAME_BYTES = 1024;
/** DeepL limits a glossary to 10 MiB; this keeps a single dictionary edit well below it. */
export const MAX_DICTIONARY_ENTRIES = 50_000;

/** Parses the `MAX_TEXT_CHARS` Worker var. Never lower than `MIN_TEXT_CHARS`. */
export function clampMaxTextChars(raw: string | number | undefined): number {
  const n = typeof raw === "number" ? raw : Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(n)) return DEFAULT_MAX_TEXT_CHARS;
  return Math.max(MIN_TEXT_CHARS, Math.floor(n));
}

export interface Limits {
  maxTextChars: number;
  maxRequestBytes: number;
}

const encoder = new TextEncoder();

/** Counts Unicode code points, which is how DeepL counts characters. */
export function countChars(text: string): number {
  let n = 0;
  for (const _ of text) n++;
  return n;
}

export function requestBytes(text: string, context = ""): number {
  return encoder.encode(text).length + encoder.encode(context).length;
}

/** Browser UI colour (status bar, task switcher) per mode; matches `--background` in layout.css. */
export const THEME_COLORS = { light: "#ffffff", dark: "#0a0a0a" };
