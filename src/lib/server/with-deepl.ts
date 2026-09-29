import { error } from "@sveltejs/kit";
import { isDeepLApiError } from "./deepl/errors";

/**
 * Runs a DeepL call and turns a `DeepLApiError` into a SvelteKit HTTP error with a safe message.
 * The original error is logged by `handleError`.
 */
export async function withDeepL<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (isDeepLApiError(e)) {
      console.error(e.message);
      error(e.status >= 400 && e.status <= 599 ? e.status : 502, e.userMessage);
    }
    throw e;
  }
}
