import type { Translation } from "#lib/server/deepl/types.js";

/** What one browser history entry of the translate page shows. */
export interface TranslateEntry {
  text: string;
  context: string;
  sourceLang: string;
  targetLang: string;
  output: string;
  outputEdited: boolean;
  result: Translation | null;
  /** The output already matches the input, so restoring it must not trigger a (billed) translation. */
  translated: boolean;
}

type Comparable = Pick<TranslateEntry, "text" | "sourceLang" | "targetLang">;

/**
 * Whether `next` continues the translation in `prev` (the user kept editing the same text) rather than
 * starting a new one. Same language pair, and the texts share a prefix and suffix covering at least
 * half of the shorter one. Continuations replace the current history entry; anything else gets its own.
 */
export function isSameTranslation(prev: Comparable, next: Comparable): boolean {
  if (prev.sourceLang !== next.sourceLang || prev.targetLang !== next.targetLang) return false;
  const a = prev.text.trim();
  const b = next.text.trim();
  const shorter = Math.min(a.length, b.length);
  if (shorter === 0) return false;

  let prefix = 0;
  while (prefix < shorter && a[prefix] === b[prefix]) prefix++;
  let suffix = 0;
  while (prefix + suffix < shorter && a[a.length - 1 - suffix] === b[b.length - 1 - suffix]) suffix++;

  return prefix + suffix >= shorter / 2;
}
