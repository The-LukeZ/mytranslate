import { countChars } from "#lib/config.js";
import { TranslateSchema } from "#lib/schemas.js";
import { deepl } from "#lib/server/deepl/client.js";
import { translateText } from "#lib/server/deepl/translate.js";
import { withDeepL } from "#lib/server/with-deepl.js";
import { MAX_TEXT_CHARS } from "$app/env/private";
import { command } from "$app/server";
import { error } from "@sveltejs/kit";
import { getUsage } from "./meta.remote.js";

export const translate = command(TranslateSchema, async (input) => {
  const max = MAX_TEXT_CHARS;
  if (countChars(input.text) > max) error(413, `Text is longer than ${max.toLocaleString("en")} characters`);

  const result = await withDeepL(() => translateText(deepl(), input));
  // Send the new usage back with this response instead of a second round-trip.
  void getUsage().refresh();
  return result;
});
