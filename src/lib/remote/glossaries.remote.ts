import { command, query } from "$app/server";
import { parseTsv, serializeTsv, trimEntries, type GlossaryEntry } from "#lib/glossary/tsv.js";
import { sameLang } from "#lib/utils/languages.js";
import {
  AddTermSchema,
  CreateGlossarySchema,
  DictionaryRefSchema,
  EntriesQuerySchema,
  GlossaryId,
  RenameGlossarySchema,
  SaveDictionarySchema,
} from "#lib/schemas.js";
import { deepl } from "#lib/server/deepl/client.js";
import { glossaries } from "#lib/server/deepl/glossaries.js";
import type { Glossary } from "#lib/server/deepl/types.js";
import { withDeepL } from "#lib/server/with-deepl.js";

const api = () => glossaries(deepl());

const byName = (a: Glossary, b: Glossary) => a.name.localeCompare(b.name);

// ── Queries ──────────────────────────────────────────────────────────────────

export const listGlossaries = query(() => withDeepL(async () => (await api().list()).glossaries.sort(byName)));

export const getGlossary = query(GlossaryId, (id) => withDeepL(() => api().get(id)));

export const getEntries = query(EntriesQuerySchema, ({ id, sourceLang, targetLang }) =>
  withDeepL(async (): Promise<GlossaryEntry[]> => {
    const dict = await api().entries(id, { sourceLang, targetLang });
    return dict ? parseTsv(dict.entries) : [];
  }),
);

// ── Commands ─────────────────────────────────────────────────────────────────

export const createGlossary = command(CreateGlossarySchema, async ({ name, sourceLang, targetLang, entries }) => {
  const glossary = await withDeepL(() =>
    api().create({
      name,
      dictionaries: [
        {
          source_lang: sourceLang,
          target_lang: targetLang,
          entries: serializeTsv(trimEntries(entries)),
          entries_format: "tsv",
        },
      ],
    }),
  );
  void listGlossaries().refresh();
  return glossary;
});

export const renameGlossary = command(RenameGlossarySchema, async ({ id, name }) => {
  const glossary = await withDeepL(() => api().patch(id, { name }));
  void listGlossaries().refresh();
  void getGlossary(id).refresh();
  return glossary;
});

export const deleteGlossary = command(GlossaryId, async (id) => {
  await withDeepL(() => api().delete(id));
  void listGlossaries().refresh();
});

/** Replaces (or creates) one dictionary with the full list of entries. */
export const saveDictionary = command(SaveDictionarySchema, async ({ id, sourceLang, targetLang, entries }) => {
  const pair = { sourceLang, targetLang };
  const info = await withDeepL(() => api().putDictionary(id, pair, serializeTsv(trimEntries(entries))));
  void getEntries({ id, sourceLang, targetLang }).refresh();
  void getGlossary(id).refresh();
  void listGlossaries().refresh();
  return info;
});

export const deleteDictionary = command(DictionaryRefSchema, async ({ id, sourceLang, targetLang }) => {
  await withDeepL(() => api().deleteDictionary(id, { sourceLang, targetLang }));
  void getGlossary(id).refresh();
  void listGlossaries().refresh();
});

/** Adds one term: merges into an existing dictionary (PATCH), or creates the dictionary (PUT). */
export const addTerm = command(AddTermSchema, async ({ id, sourceLang, targetLang, source, target }) => {
  const client = api();
  const tsv = serializeTsv([{ source, target }]);
  const glossary = await withDeepL(() => client.get(id));
  const exists = glossary.dictionaries.some(
    (d) => sameLang(d.source_lang, sourceLang) && sameLang(d.target_lang, targetLang),
  );

  if (exists) {
    await withDeepL(() =>
      client.patch(id, {
        dictionaries: [{ source_lang: sourceLang, target_lang: targetLang, entries: tsv, entries_format: "tsv" }],
      }),
    );
  } else {
    await withDeepL(() => client.putDictionary(id, { sourceLang, targetLang }, tsv));
  }

  void getEntries({ id, sourceLang, targetLang }).refresh();
  void getGlossary(id).refresh();
  void listGlossaries().refresh();
  return { created: !exists };
});
