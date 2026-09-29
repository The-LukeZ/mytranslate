import type { DeepLClient } from "./client";
import type { Language, LanguageResource } from "./types";

const TTL_MS = 24 * 60 * 60 * 1000;

// Per-isolate memo: at most about one DeepL call per resource per isolate per day.
const cache = new Map<LanguageResource, { at: number; value: Promise<Language[]> }>();

export function getLanguages(client: DeepLClient, resource: LanguageResource, now = Date.now()): Promise<Language[]> {
  const hit = cache.get(resource);
  if (hit && now - hit.at < TTL_MS) return hit.value;

  const value = client.get<Language[]>("v3/languages", { searchParams: { resource } });
  cache.set(resource, { at: now, value });
  // Don't keep failures around.
  value.catch(() => {
    if (cache.get(resource)?.value === value) cache.delete(resource);
  });
  return value;
}

/** Test helper. */
export function clearLanguageCache(): void {
  cache.clear();
}
