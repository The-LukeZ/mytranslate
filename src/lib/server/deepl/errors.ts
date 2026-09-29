import { HTTPError, TimeoutError, isKyError } from "ky";
import type { DeepLErrorBody } from "./types";

/** An error from the DeepL API with a message that is safe to show in the UI. */
export class DeepLApiError extends Error {
  override name = "DeepLApiError" as const;

  constructor(
    readonly status: number,
    message: string,
    readonly userMessage: string,
    readonly code?: string,
  ) {
    super(message);
  }
}

export function isDeepLApiError(e: unknown): e is DeepLApiError {
  return e instanceof DeepLApiError;
}

/** Maps a DeepL status code (and its own message, if any) to a message for the UI. */
export function userMessageFor(status: number, apiMessage?: string): string {
  switch (status) {
    case 400:
      return apiMessage ? `DeepL rejected the request: ${apiMessage}` : "DeepL rejected the request.";
    case 403:
      return "DeepL key rejected — check DEEPL_API_KEY.";
    case 404:
      return "Not found. The glossary may have been deleted.";
    case 413:
      return "The request is too large for DeepL.";
    case 429:
    case 529:
      return "Too many requests, try again shortly.";
    case 456:
      return "Monthly character quota exhausted.";
    default:
      if (status >= 500) return "DeepL is having problems right now. Try again later.";
      return apiMessage ?? `DeepL request failed (${status}).`;
  }
}

function readBody(data: unknown): DeepLErrorBody {
  if (data && typeof data === "object") return data as DeepLErrorBody;
  if (typeof data === "string" && data.trim()) return { message: data.trim() };
  return {};
}

/** Converts any error thrown by ky into a `DeepLApiError`. Used as ky's `beforeError` hook. */
export function toDeepLApiError(error: unknown): DeepLApiError {
  if (error instanceof DeepLApiError) return error;

  if (error instanceof HTTPError) {
    const status = error.response.status;
    const body = readBody(error.data);
    const apiMessage = body.message ?? body.detail;
    const code = body.code === undefined ? undefined : String(body.code);
    return new DeepLApiError(
      status,
      `DeepL ${error.request.method} ${new URL(error.request.url).pathname} → ${status}${apiMessage ? `: ${apiMessage}` : ""}`,
      userMessageFor(status, apiMessage),
      code,
    );
  }

  if (error instanceof TimeoutError) {
    return new DeepLApiError(
      504,
      `DeepL request timed out: ${error.message}`,
      "DeepL took too long to respond. Try again.",
    );
  }

  if (isKyError(error) || error instanceof Error) {
    return new DeepLApiError(502, `DeepL request failed: ${error.message}`, "Could not reach DeepL. Try again.");
  }

  return new DeepLApiError(500, `DeepL request failed: ${String(error)}`, "Something went wrong talking to DeepL.");
}
