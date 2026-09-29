import { replaceOption } from "ky";
import { NON_IDEMPOTENT_RETRY_STATUS_CODES, type DeepLClient } from "./client";
import type {
  CreateGlossaryRequest,
  DictionaryEntries,
  Glossary,
  GlossaryEntriesResponse,
  GlossaryList,
  PatchGlossaryRequest,
  PutDictionaryResponse,
} from "./types";

export interface LangPair {
  sourceLang: string;
  targetLang: string;
}

const path = (id: string, suffix = "") => `v3/glossaries/${encodeURIComponent(id)}${suffix}`;
const pairParams = ({ sourceLang, targetLang }: LangPair) => ({ source_lang: sourceLang, target_lang: targetLang });

export function glossaries(client: DeepLClient) {
  return {
    list: () => client.get<GlossaryList>("v3/glossaries"),

    get: (id: string) => client.get<Glossary>(path(id)),

    /** Only rate limits are retried: retrying after a 5xx could create a duplicate glossary. */
    create: (body: CreateGlossaryRequest) =>
      client.post<Glossary>("v3/glossaries", {
        json: body,
        // replaceOption: ky concatenates arrays when merging, which would keep the 5xx codes.
        retry: { statusCodes: replaceOption(NON_IDEMPOTENT_RETRY_STATUS_CODES) },
      }),

    /** Rename and/or merge entries into at most one dictionary. Cannot delete entries. */
    patch: (id: string, body: PatchGlossaryRequest) => client.patch<Glossary>(path(id), { json: body }),

    delete: (id: string) => client.delete(path(id)),

    async entries(id: string, pair: LangPair): Promise<DictionaryEntries | undefined> {
      const res = await client.get<GlossaryEntriesResponse>(path(id, "/entries"), { searchParams: pairParams(pair) });
      return res.dictionaries[0];
    },

    /** Replace (or create) one dictionary with the full TSV. */
    putDictionary: (id: string, pair: LangPair, tsv: string) =>
      client.put<PutDictionaryResponse>(path(id, "/dictionaries"), {
        json: { ...pairParams(pair), entries: tsv, entries_format: "tsv" },
      }),

    deleteDictionary: (id: string, pair: LangPair) =>
      client.delete(path(id, "/dictionaries"), { searchParams: pairParams(pair) }),
  };
}

export type GlossaryApi = ReturnType<typeof glossaries>;
