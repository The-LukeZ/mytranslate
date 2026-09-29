import ky, { type KyInstance, type Options } from "ky";
import { DEEPL_API_KEY } from "$app/env/private";
import { toDeepLApiError } from "./errors";

export const FREE_API_URL = "https://api-free.deepl.com/";
export const PRO_API_URL = "https://api.deepl.com/";

/** Free keys end in `:fx`. */
export function baseUrlFor(apiKey: string): string {
  return apiKey.trim().endsWith(":fx") ? FREE_API_URL : PRO_API_URL;
}

/** Status codes that are safe to retry for every request. */
export const RETRY_STATUS_CODES = [429, 500, 502, 503, 504, 529];
/** Only rate limits are retried when a retry could create a duplicate (glossary create). */
export const NON_IDEMPOTENT_RETRY_STATUS_CODES = [429, 529];

export interface DeepLClientOptions {
  /** Override `fetch` (tests). */
  fetch?: typeof fetch;
  /** Override retry delays (tests). */
  retryDelay?: (attempt: number) => number;
}

export interface DeepLClient {
  readonly http: KyInstance;
  get<T>(path: string, options?: Options): Promise<T>;
  post<T>(path: string, options?: Options): Promise<T>;
  put<T>(path: string, options?: Options): Promise<T>;
  patch<T>(path: string, options?: Options): Promise<T>;
  delete(path: string, options?: Options): Promise<void>;
}

export function createDeepL(apiKey: string, opts: DeepLClientOptions = {}): DeepLClient {
  const http = ky.create({
    baseUrl: baseUrlFor(apiKey),
    headers: {
      Authorization: `DeepL-Auth-Key ${apiKey.trim()}`,
      "User-Agent": "mytranslate/1.0",
    },
    timeout: 15_000,
    totalTimeout: 30_000,
    retry: {
      limit: 3,
      // POST /v2/translate is safe to retry; glossary create overrides this below.
      methods: ["get", "put", "delete", "patch", "post"],
      statusCodes: RETRY_STATUS_CODES,
      afterStatusCodes: [429, 503, 529], // honour Retry-After
      maxRetryAfter: 10_000,
      backoffLimit: 5_000,
      jitter: true,
      ...(opts.retryDelay ? { delay: opts.retryDelay, jitter: false } : {}),
    },
    hooks: {
      beforeError: [({ error }) => toDeepLApiError(error)],
    },
    ...(opts.fetch ? { fetch: opts.fetch } : {}),
  });

  async function run<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      throw toDeepLApiError(error);
    }
  }

  return {
    http,
    get: (path, options) => run(() => http.get(path, options).json()),
    post: (path, options) => run(() => http.post(path, options).json()),
    put: (path, options) => run(() => http.put(path, options).json()),
    patch: (path, options) => run(() => http.patch(path, options).json()),
    delete: (path, options) => run(async () => void (await http.delete(path, options))),
  };
}

/** A DeepL client for the current request. Cheap to create; call it per request. */
export function deepl(): DeepLClient {
  return createDeepL(DEEPL_API_KEY);
}
