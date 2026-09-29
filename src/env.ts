import { defineEnvVars } from "@sveltejs/kit/env";
import { building } from "$app/env";
import { clampMaxTextChars } from "#lib/config.js";

// Read when the app starts: from the Worker env in production (wrangler vars + secrets),
// from `.env` in dev. Import them from `$app/env/private` (server-only).
export const variables = defineEnvVars({
  DEEPL_API_KEY: {
    description: "DeepL API key (a Worker secret). Free keys end in `:fx`.",
    // Required at runtime; the build's analysis step runs without secrets, so allow it to be missing there.
    schema: (value) => {
      const key = value?.trim();
      if (key) return key;
      if (building) return "";
      throw new Error("DEEPL_API_KEY is not set. Add it to .env for dev, or `wrangler secret put DEEPL_API_KEY`.");
    },
  },
  MAX_TEXT_CHARS: {
    description: "Maximum characters per translation request. Never lower than 5,000.",
    schema: (value) => clampMaxTextChars(value),
  },
});
