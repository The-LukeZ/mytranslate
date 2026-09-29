import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("$app/env/private", () => ({ DEEPL_API_KEY: "test-key:fx", MAX_TEXT_CHARS: 30_000 }));

import {
  FREE_API_URL,
  NON_IDEMPOTENT_RETRY_STATUS_CODES,
  PRO_API_URL,
  RETRY_STATUS_CODES,
  baseUrlFor,
  createDeepL,
} from "./client";
import { DeepLApiError, isDeepLApiError, toDeepLApiError, userMessageFor } from "./errors";
import { glossaries } from "./glossaries";
import { clearLanguageCache, getLanguages } from "./languages";
import { buildTranslateRequest, translateText } from "./translate";

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

const PRO_KEY = "pro-key-123";
const FREE_KEY = "free-key-456:fx";

let mockFetch: ReturnType<typeof vi.fn<typeof fetch>>;

interface RecordedCall {
  url: URL;
  method: string;
  headers: Headers;
  text: string;
  body: Record<string, unknown> | undefined;
}
let recorded: RecordedCall[];

/**
 * ky passes a Request to fetch and consumes its body afterwards, so snapshot each call
 * (url, method, headers, body) at call time before delegating to the `mockFetch` spy.
 */
const recordingFetch: typeof fetch = async (input, init) => {
  const req = input instanceof Request ? input : new Request(input, init);
  const text = await req.clone().text();
  recorded.push({
    url: new URL(req.url),
    method: req.method,
    headers: req.headers,
    text,
    body: text ? (JSON.parse(text) as Record<string, unknown>) : undefined,
  });
  return mockFetch(input, init);
};

function makeClient(key = PRO_KEY) {
  return createDeepL(key, { fetch: recordingFetch, retryDelay: () => 0 });
}

function inspect(callIndex: number): RecordedCall {
  const call = recorded[callIndex];
  if (!call) throw new Error(`no fetch call at index ${callIndex}`);
  return call;
}

async function caught(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("expected promise to reject");
}

beforeEach(() => {
  mockFetch = vi.fn<typeof fetch>();
  recorded = [];
  clearLanguageCache();
});

describe("baseUrlFor", () => {
  it("uses the free API for keys ending in :fx", () => {
    expect(baseUrlFor(FREE_KEY)).toBe(FREE_API_URL);
    expect(baseUrlFor(`  ${FREE_KEY}  `)).toBe(FREE_API_URL);
  });

  it("uses the pro API otherwise", () => {
    expect(baseUrlFor(PRO_KEY)).toBe(PRO_API_URL);
    expect(baseUrlFor("abc:fx-not-suffix")).toBe(PRO_API_URL);
  });
});

describe("createDeepL requests", () => {
  it("sends free keys to api-free.deepl.com with the auth header", async () => {
    mockFetch.mockResolvedValueOnce(json({ character_count: 1, character_limit: 2 }));
    await makeClient(FREE_KEY).get("v2/usage");

    const call = inspect(0);
    expect(call.url.href).toBe("https://api-free.deepl.com/v2/usage");
    expect(call.method).toBe("GET");
    expect(call.headers.get("authorization")).toBe(`DeepL-Auth-Key ${FREE_KEY}`);
  });

  it("sends other keys to api.deepl.com with the auth header", async () => {
    mockFetch.mockResolvedValueOnce(json({}));
    await makeClient(PRO_KEY).get("v2/usage");

    const call = inspect(0);
    expect(call.url.href).toBe("https://api.deepl.com/v2/usage");
    expect(call.headers.get("authorization")).toBe(`DeepL-Auth-Key ${PRO_KEY}`);
  });

  it("trims whitespace around the key in the header", async () => {
    mockFetch.mockResolvedValueOnce(json({}));
    await makeClient(`  ${PRO_KEY}\n`).get("v2/usage");

    expect(inspect(0).headers.get("authorization")).toBe(`DeepL-Auth-Key ${PRO_KEY}`);
  });
});

describe("error mapping", () => {
  it("maps 403 to a key-rejected message mentioning DEEPL_API_KEY", async () => {
    mockFetch.mockResolvedValueOnce(new Response("Forbidden", { status: 403 }));
    const error = await caught(makeClient().get("v2/usage"));

    expect(error).toBeInstanceOf(DeepLApiError);
    expect(isDeepLApiError(error)).toBe(true);
    expect((error as DeepLApiError).status).toBe(403);
    expect((error as DeepLApiError).userMessage).toContain("DEEPL_API_KEY");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("maps 456 to the quota message", async () => {
    mockFetch.mockResolvedValueOnce(new Response("Quota Exceeded", { status: 456 }));
    const error = (await caught(makeClient().get("v2/usage"))) as DeepLApiError;

    expect(error).toBeInstanceOf(DeepLApiError);
    expect(error.status).toBe(456);
    expect(error.userMessage).toMatch(/quota/i);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("includes the API message for a 400 with a JSON body", async () => {
    mockFetch.mockResolvedValueOnce(json({ message: "bad" }, 400));
    const error = (await caught(makeClient().post("v2/translate", { json: {} }))) as DeepLApiError;

    expect(error.status).toBe(400);
    expect(error.userMessage).toContain("bad");
    expect(error.message).toContain("bad");
  });

  it("carries the DeepL error code as a string", async () => {
    mockFetch.mockResolvedValueOnce(json({ message: "nope", code: 1234 }, 400));
    const error = (await caught(makeClient().get("v2/usage"))) as DeepLApiError;

    expect(error.code).toBe("1234");
  });

  it("wraps network failures as a 502", async () => {
    mockFetch.mockRejectedValue(new TypeError("fetch failed"));
    const error = (await caught(makeClient().get("v2/usage"))) as DeepLApiError;

    expect(error).toBeInstanceOf(DeepLApiError);
    expect(error.status).toBe(502);
  });

  it("gives up after the retry limit on persistent 5xx", async () => {
    mockFetch.mockImplementation(async () => new Response("down", { status: 503 }));
    const error = (await caught(makeClient().get("v2/usage"))) as DeepLApiError;

    expect(error.status).toBe(503);
    expect(mockFetch).toHaveBeenCalledTimes(4); // 1 + 3 retries
  });
});

describe("userMessageFor", () => {
  it("maps known statuses", () => {
    expect(userMessageFor(400)).toBe("DeepL rejected the request.");
    expect(userMessageFor(400, "bad")).toContain("bad");
    expect(userMessageFor(403)).toContain("DEEPL_API_KEY");
    expect(userMessageFor(404)).toMatch(/not found/i);
    expect(userMessageFor(413)).toMatch(/too large/i);
    expect(userMessageFor(429)).toMatch(/too many requests/i);
    expect(userMessageFor(529)).toBe(userMessageFor(429));
    expect(userMessageFor(456)).toMatch(/quota/i);
  });

  it("maps any 5xx to a generic outage message", () => {
    expect(userMessageFor(500)).toMatch(/problems/i);
    expect(userMessageFor(503, "ignored")).toMatch(/problems/i);
  });

  it("falls back to the API message or a status line", () => {
    expect(userMessageFor(418, "teapot")).toBe("teapot");
    expect(userMessageFor(418)).toContain("418");
  });
});

describe("toDeepLApiError", () => {
  it("returns an existing DeepLApiError unchanged", () => {
    const err = new DeepLApiError(400, "m", "u");
    expect(toDeepLApiError(err)).toBe(err);
  });

  it("maps generic errors to 502", () => {
    const err = toDeepLApiError(new Error("boom"));
    expect(err).toBeInstanceOf(DeepLApiError);
    expect(err.status).toBe(502);
    expect(err.message).toContain("boom");
  });

  it("maps non-Error values to 500", () => {
    const err = toDeepLApiError("weird");
    expect(err.status).toBe(500);
    expect(err.message).toContain("weird");
  });
});

describe("retry", () => {
  it("retries translateText after a 503 and succeeds", async () => {
    mockFetch
      .mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
      .mockResolvedValueOnce(
        json({ translations: [{ text: "Hallo", detected_source_language: "EN", billed_characters: 5 }] }),
      );

    const result = await translateText(makeClient(), { text: "Hello", targetLang: "DE" });

    expect(result).toEqual({ text: "Hallo", detected_source_language: "EN", billed_characters: 5 });
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(inspect(1).method).toBe("POST");
  });

  it("does not retry 4xx client errors", async () => {
    mockFetch.mockResolvedValueOnce(json({ message: "bad" }, 400));
    await caught(translateText(makeClient(), { text: "x", targetLang: "DE" }));

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("throws when DeepL returns no translations", async () => {
    mockFetch.mockResolvedValueOnce(json({ translations: [] }));
    const error = await caught(translateText(makeClient(), { text: "x", targetLang: "DE" }));

    expect((error as Error).message).toMatch(/no translation/i);
  });
});

describe("glossary create retry override", () => {
  const body = {
    name: "g",
    dictionaries: [{ source_lang: "en", target_lang: "de", entries: "a\tb", entries_format: "tsv" as const }],
  };
  const created = { glossary_id: "gid", name: "g", dictionaries: [], creation_time: "2026-01-01T00:00:00Z" };

  it("exposes the retry status lists", () => {
    expect(RETRY_STATUS_CODES).toContain(500);
    expect(NON_IDEMPOTENT_RETRY_STATUS_CODES).not.toContain(500);
  });

  it("does NOT retry a 500", async () => {
    mockFetch.mockImplementation(async () => new Response("boom", { status: 500 }));
    const error = await caught(glossaries(makeClient()).create(body));

    expect(error).toBeInstanceOf(DeepLApiError);
    expect((error as DeepLApiError).status).toBe(500);
    // KNOWN FAILURE: glossaries.ts passes `retry: { statusCodes: [429, 529] }` per request, but ky
    // deep-merges arrays (concatenates) with the instance default, so a 500 is still retried 3 times and
    // glossary create can produce duplicates. Fix: wrap the override in ky's `replaceOption(...)`.
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("does NOT retry a 503", async () => {
    mockFetch.mockImplementation(async () => new Response("unavailable", { status: 503 }));
    const error = await caught(glossaries(makeClient()).create(body));

    expect((error as DeepLApiError).status).toBe(503);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("retries a 429 and succeeds", async () => {
    mockFetch
      .mockResolvedValueOnce(new Response("slow down", { status: 429 }))
      .mockResolvedValueOnce(json(created, 201));
    const result = await glossaries(makeClient()).create(body);

    expect(result.glossary_id).toBe("gid");
    expect(mockFetch).toHaveBeenCalledTimes(2);
    const call = inspect(1);
    expect(call.method).toBe("POST");
    expect(call.url.pathname).toBe("/v3/glossaries");
    expect(call.body).toEqual(body);
  });

  it("other glossary calls keep the default retries", async () => {
    mockFetch
      .mockResolvedValueOnce(new Response("boom", { status: 500 }))
      .mockResolvedValueOnce(json({ glossaries: [] }));
    const result = await glossaries(makeClient()).list();

    expect(result).toEqual({ glossaries: [] });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});

describe("buildTranslateRequest", () => {
  it("builds the minimal request", () => {
    expect(buildTranslateRequest({ text: "Hi", targetLang: "DE" })).toEqual({
      text: ["Hi"],
      target_lang: "DE",
      show_billed_characters: true,
    });
  });

  it("drops glossary_id when sourceLang is missing", () => {
    const body = buildTranslateRequest({ text: "Hi", targetLang: "DE", glossaryId: "g1" });
    expect(body).not.toHaveProperty("glossary_id");
    expect(body).not.toHaveProperty("source_lang");
  });

  it("keeps glossary_id when sourceLang is set", () => {
    const body = buildTranslateRequest({ text: "Hi", targetLang: "DE", sourceLang: "EN", glossaryId: "g1" });
    expect(body.glossary_id).toBe("g1");
    expect(body.source_lang).toBe("EN");
  });

  it("omits formality 'default' but keeps other values", () => {
    expect(buildTranslateRequest({ text: "Hi", targetLang: "DE", formality: "default" })).not.toHaveProperty(
      "formality",
    );
    expect(buildTranslateRequest({ text: "Hi", targetLang: "DE", formality: "more" }).formality).toBe("more");
  });

  it("omits empty or blank context and keeps real context", () => {
    expect(buildTranslateRequest({ text: "Hi", targetLang: "DE", context: "" })).not.toHaveProperty("context");
    expect(buildTranslateRequest({ text: "Hi", targetLang: "DE", context: "   " })).not.toHaveProperty("context");
    expect(buildTranslateRequest({ text: "Hi", targetLang: "DE", context: "greeting" }).context).toBe("greeting");
  });

  it("always asks for billed characters and passes model_type through", () => {
    const body = buildTranslateRequest({ text: "Hi", targetLang: "DE", modelType: "latency_optimized" });
    expect(body.show_billed_characters).toBe(true);
    expect(body.model_type).toBe("latency_optimized");
  });

  it("sends the built request as the JSON body", async () => {
    mockFetch.mockResolvedValueOnce(json({ translations: [{ text: "Hallo", detected_source_language: "EN" }] }));
    await translateText(makeClient(), { text: "Hi", targetLang: "DE", sourceLang: "EN", glossaryId: "g1" });

    const call = inspect(0);
    expect(call.url.pathname).toBe("/v2/translate");
    expect(call.body).toEqual({
      text: ["Hi"],
      target_lang: "DE",
      source_lang: "EN",
      glossary_id: "g1",
      show_billed_characters: true,
    });
  });
});

describe("getLanguages", () => {
  const langs = [{ lang: "en", name: "English", usable_as_source: true, usable_as_target: true }];

  it("memoises within the TTL", async () => {
    mockFetch.mockImplementation(async () => json(langs));
    const client = makeClient();
    const t0 = 1_000_000;

    const a = await getLanguages(client, "translate_text", t0);
    const b = await getLanguages(client, "translate_text", t0 + 60_000);

    expect(a).toEqual(langs);
    expect(b).toEqual(langs);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const call = inspect(0);
    expect(call.url.pathname).toBe("/v3/languages");
    expect(call.url.searchParams.get("resource")).toBe("translate_text");
  });

  it("refetches after 24 hours", async () => {
    mockFetch.mockImplementation(async () => json(langs));
    const client = makeClient();
    const t0 = 1_000_000;
    const day = 24 * 60 * 60 * 1000;

    await getLanguages(client, "translate_text", t0);
    await getLanguages(client, "translate_text", t0 + day - 1);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    await getLanguages(client, "translate_text", t0 + day);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("caches each resource separately", async () => {
    mockFetch.mockImplementation(async () => json(langs));
    const client = makeClient();

    await getLanguages(client, "translate_text", 1);
    await getLanguages(client, "glossary", 1);

    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("does not cache failures", async () => {
    mockFetch.mockResolvedValueOnce(new Response("nope", { status: 403 })).mockResolvedValueOnce(json(langs));
    const client = makeClient();

    await expect(getLanguages(client, "translate_text", 1)).rejects.toBeInstanceOf(DeepLApiError);
    // Let the cache-eviction catch handler run.
    await Promise.resolve();
    await expect(getLanguages(client, "translate_text", 2)).resolves.toEqual(langs);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("clearLanguageCache forces a refetch", async () => {
    mockFetch.mockImplementation(async () => json(langs));
    const client = makeClient();

    await getLanguages(client, "translate_text", 1);
    clearLanguageCache();
    await getLanguages(client, "translate_text", 2);

    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});

describe("glossary dictionary request shapes", () => {
  it("putDictionary PUTs JSON with tsv entries", async () => {
    const info = { source_lang: "en", target_lang: "de", entry_count: 1 };
    mockFetch.mockResolvedValueOnce(json(info));
    const result = await glossaries(makeClient()).putDictionary(
      "gid-1",
      { sourceLang: "en", targetLang: "de" },
      "a\tb",
    );

    expect(result).toEqual(info);
    const call = inspect(0);
    expect(call.method).toBe("PUT");
    expect(call.url.pathname).toBe("/v3/glossaries/gid-1/dictionaries");
    expect(call.headers.get("content-type")).toContain("application/json");
    expect(call.body).toEqual({ source_lang: "en", target_lang: "de", entries: "a\tb", entries_format: "tsv" });
  });

  it("deleteDictionary DELETEs with language query params and resolves to undefined", async () => {
    mockFetch.mockResolvedValueOnce(new Response(null, { status: 204 }));
    const result = await glossaries(makeClient()).deleteDictionary("gid-1", { sourceLang: "en", targetLang: "de" });

    expect(result).toBeUndefined();
    const call = inspect(0);
    expect(call.method).toBe("DELETE");
    expect(call.url.pathname).toBe("/v3/glossaries/gid-1/dictionaries");
    expect(call.url.searchParams.get("source_lang")).toBe("en");
    expect(call.url.searchParams.get("target_lang")).toBe("de");
    expect(call.text).toBe("");
  });

  it("encodes glossary ids in the path", async () => {
    mockFetch.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await glossaries(makeClient()).delete("a/b c");

    expect(inspect(0).url.pathname).toBe("/v3/glossaries/a%2Fb%20c");
  });

  it("entries returns the first dictionary", async () => {
    const dict = { source_lang: "en", target_lang: "de", entries: "a\tb", entries_format: "tsv" };
    mockFetch.mockResolvedValueOnce(json({ dictionaries: [dict] }));
    const result = await glossaries(makeClient()).entries("gid", { sourceLang: "en", targetLang: "de" });

    expect(result).toEqual(dict);
    const call = inspect(0);
    expect(call.url.pathname).toBe("/v3/glossaries/gid/entries");
    expect(call.url.searchParams.get("source_lang")).toBe("en");
  });
});
