import * as v from "valibot";
import {
  MAX_CONTEXT_CHARS,
  MAX_DICTIONARY_ENTRIES,
  MAX_GLOSSARY_NAME_BYTES,
  MAX_REQUEST_BYTES,
  requestBytes,
} from "./config";
import { MAX_TERM_BYTES, utf8Bytes, validateEntries } from "./glossary/tsv";

// ── Primitives ───────────────────────────────────────────────────────────────

/** `en`, `de`, `en-US`, `zh-HANS`, `pt-BR`. */
export const LangCode = v.pipe(
  v.string(),
  v.trim(),
  v.regex(/^[a-z]{2,3}(-[a-z0-9]{2,4})?$/i, "Invalid language code"),
);

export const GlossaryId = v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(128));

export const GlossaryName = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(1, "Name is required"),
  v.check((s) => utf8Bytes(s) <= MAX_GLOSSARY_NAME_BYTES, `Name is longer than ${MAX_GLOSSARY_NAME_BYTES} bytes`),
);

export const FormalitySchema = v.picklist(["default", "more", "less", "prefer_more", "prefer_less"]);
export const ModelTypeSchema = v.picklist(["quality_optimized", "prefer_quality_optimized", "latency_optimized"]);
export const LanguageResourceSchema = v.picklist(["translate_text", "glossary"]);

// ── Translate ────────────────────────────────────────────────────────────────

export const TranslateSchema = v.pipe(
  v.object({
    text: v.pipe(
      v.string(),
      v.check((s) => s.trim().length > 0, "Enter some text to translate"),
    ),
    targetLang: LangCode,
    sourceLang: v.optional(LangCode),
    glossaryId: v.optional(GlossaryId),
    formality: v.optional(FormalitySchema),
    context: v.optional(v.pipe(v.string(), v.maxLength(MAX_CONTEXT_CHARS))),
    modelType: v.optional(ModelTypeSchema),
  }),
  v.check((i) => !i.glossaryId || !!i.sourceLang, "A glossary needs an explicit source language"),
  v.check(
    (i) => requestBytes(i.text, i.context) <= MAX_REQUEST_BYTES,
    "Text and context are too large for one request",
  ),
);
export type TranslateInput = v.InferInput<typeof TranslateSchema>;

// ── Glossaries ───────────────────────────────────────────────────────────────

export const PairSchema = v.object({ sourceLang: LangCode, targetLang: LangCode });

export const EntrySchema = v.object({
  source: v.pipe(v.string(), v.trim()),
  target: v.pipe(v.string(), v.trim()),
});

/** Trims every term, then applies DeepL's rules (see `validateEntries`). */
export const EntriesSchema = v.pipe(
  v.array(EntrySchema),
  v.minLength(1, "A dictionary needs at least one entry"),
  v.maxLength(MAX_DICTIONARY_ENTRIES, `At most ${MAX_DICTIONARY_ENTRIES} entries per dictionary`),
  v.rawCheck(({ dataset, addIssue }) => {
    if (!dataset.typed) return;
    for (const issue of validateEntries(dataset.value)) {
      addIssue({ message: `Row ${issue.row + 1}: ${issue.message}`, path: undefined });
    }
  }),
);

export const EntriesQuerySchema = v.object({ id: GlossaryId, sourceLang: LangCode, targetLang: LangCode });

export const CreateGlossarySchema = v.object({
  name: GlossaryName,
  sourceLang: LangCode,
  targetLang: LangCode,
  entries: EntriesSchema,
});
export type CreateGlossaryInput = v.InferInput<typeof CreateGlossarySchema>;

export const RenameGlossarySchema = v.object({ id: GlossaryId, name: GlossaryName });

export const SaveDictionarySchema = v.object({
  id: GlossaryId,
  sourceLang: LangCode,
  targetLang: LangCode,
  entries: EntriesSchema,
});
export type SaveDictionaryInput = v.InferInput<typeof SaveDictionarySchema>;

export const DictionaryRefSchema = v.object({ id: GlossaryId, sourceLang: LangCode, targetLang: LangCode });

const Term = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(1, "Term is required"),
  v.regex(/^[^\t\r\n]*$/, "Terms can't contain tabs or line breaks"),
  v.check((s) => utf8Bytes(s) <= MAX_TERM_BYTES, `Term is longer than ${MAX_TERM_BYTES} bytes`),
);

export const AddTermSchema = v.object({
  id: GlossaryId,
  sourceLang: LangCode,
  targetLang: LangCode,
  source: Term,
  target: Term,
});
export type AddTermInput = v.InferInput<typeof AddTermSchema>;
