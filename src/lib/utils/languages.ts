import type { Language } from "#lib/server/deepl/types.js";

export type { Language };

/** `en-US` → `en`, `ZH-HANS` → `zh`. Glossaries use base codes. */
export function baseLang(code: string): string {
  return code.split("-")[0]!.toLowerCase();
}

/** Case-insensitive code comparison. */
export function sameLang(a: string | undefined, b: string | undefined): boolean {
  return !!a && !!b && a.toLowerCase() === b.toLowerCase();
}

export function findLang(languages: Language[], code: string | undefined): Language | undefined {
  if (!code) return undefined;
  return languages.find((l) => sameLang(l.lang, code));
}

export function langLabel(languages: Language[], code: string | undefined): string {
  if (!code) return "";
  return findLang(languages, code)?.name ?? code.toUpperCase();
}

export function sortByName(languages: Language[]): Language[] {
  return [...languages].sort((a, b) => a.name.localeCompare(b.name));
}

export function sourceLanguages(languages: Language[]): Language[] {
  return sortByName(languages.filter((l) => l.usable_as_source));
}

export function targetLanguages(languages: Language[]): Language[] {
  return sortByName(languages.filter((l) => l.usable_as_target));
}

export function supportsFormality(languages: Language[], target: string | undefined): boolean {
  return findLang(languages, target)?.features?.formality !== undefined;
}

/** Short display form for a pair, e.g. `EN → DE`. */
export function pairLabel(source: string, target: string): string {
  return `${source.toUpperCase()} → ${target.toUpperCase()}`;
}

/**
 * Target to use after swapping, given the old source (a base code such as `en`).
 * Picks the remembered regional variant when the base code alone isn't a valid target.
 */
export function swapTarget(
  targets: Language[],
  oldSource: string,
  lastVariants: Record<string, string> = {},
): string | undefined {
  const base = baseLang(oldSource);
  const remembered = lastVariants[base];
  if (remembered && findLang(targets, remembered)) return findLang(targets, remembered)!.lang;
  const exact = findLang(targets, base);
  if (exact) return exact.lang;
  return targets.find((t) => baseLang(t.lang) === base)?.lang;
}

/** Source to use after swapping, given the old target (possibly regional, e.g. `en-US`). */
export function swapSource(sources: Language[], oldTarget: string): string | undefined {
  return findLang(sources, oldTarget)?.lang ?? findLang(sources, baseLang(oldTarget))?.lang;
}
