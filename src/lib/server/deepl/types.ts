// Hand-written from DeepL's OpenAPI spec. Only the fields this app uses are typed.

export type Formality = "default" | "more" | "less" | "prefer_more" | "prefer_less";
export type ModelType = "quality_optimized" | "prefer_quality_optimized" | "latency_optimized";

// ── Translate ────────────────────────────────────────────────────────────────

export interface TranslateRequest {
  text: string[];
  target_lang: string;
  source_lang?: string;
  glossary_id?: string;
  formality?: Formality;
  context?: string;
  model_type?: ModelType;
  show_billed_characters?: boolean;
}

export interface Translation {
  text: string;
  detected_source_language: string;
  billed_characters?: number;
  model_type_used?: ModelType;
}

export interface TranslateResponse {
  translations: Translation[];
}

// ── Usage ────────────────────────────────────────────────────────────────────

export interface Usage {
  character_count: number;
  character_limit: number;
}

// ── Languages (v3) ───────────────────────────────────────────────────────────

export type LanguageResource = "translate_text" | "glossary";

export interface Language {
  lang: string;
  name: string;
  usable_as_source: boolean;
  usable_as_target: boolean;
  status?: string;
  features?: {
    formality?: unknown;
    glossary?: unknown;
    [feature: string]: unknown;
  };
}

// ── Glossaries (v3) ──────────────────────────────────────────────────────────

export type EntriesFormat = "tsv" | "csv";

export interface GlossaryDictionaryInfo {
  source_lang: string;
  target_lang: string;
  entry_count: number;
}

export interface Glossary {
  glossary_id: string;
  name: string;
  dictionaries: GlossaryDictionaryInfo[];
  creation_time: string;
}

export interface GlossaryList {
  glossaries: Glossary[];
}

export interface DictionaryInput {
  source_lang: string;
  target_lang: string;
  entries: string;
  entries_format: EntriesFormat;
}

export interface CreateGlossaryRequest {
  name: string;
  dictionaries: DictionaryInput[];
}

export interface PatchGlossaryRequest {
  name?: string;
  dictionaries?: DictionaryInput[];
}

export interface DictionaryEntries {
  source_lang: string;
  target_lang: string;
  entries: string;
  entries_format: EntriesFormat;
}

export interface GlossaryEntriesResponse {
  dictionaries: DictionaryEntries[];
}

export type PutDictionaryResponse = GlossaryDictionaryInfo;

// ── Errors ───────────────────────────────────────────────────────────────────

export interface DeepLErrorBody {
  message?: string;
  code?: string | number;
  detail?: string;
}
