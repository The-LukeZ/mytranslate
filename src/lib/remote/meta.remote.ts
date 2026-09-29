import { query } from "$app/server";
import { MAX_TEXT_CHARS } from "$app/env/private";
import { MAX_REQUEST_BYTES, type Limits } from "#lib/config.js";
import { LanguageResourceSchema } from "#lib/schemas.js";
import { deepl } from "#lib/server/deepl/client.js";
import { getLanguages as fetchLanguages } from "#lib/server/deepl/languages.js";
import { getUsage as fetchUsage } from "#lib/server/deepl/translate.js";
import { withDeepL } from "#lib/server/with-deepl.js";

export const getLanguages = query(LanguageResourceSchema, (resource) =>
  withDeepL(() => fetchLanguages(deepl(), resource)),
);

export const getUsage = query(() => withDeepL(() => fetchUsage(deepl())));

export const getLimits = query((): Limits => {
  return { maxTextChars: MAX_TEXT_CHARS, maxRequestBytes: MAX_REQUEST_BYTES };
});
