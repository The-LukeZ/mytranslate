import type { DeepLClient } from "./client";
import type { Formality, ModelType, TranslateRequest, TranslateResponse, Translation, Usage } from "./types";

export interface TranslateInput {
  text: string;
  targetLang: string;
  sourceLang?: string;
  glossaryId?: string;
  formality?: Formality;
  context?: string;
  modelType?: ModelType;
}

export function buildTranslateRequest(input: TranslateInput): TranslateRequest {
  const body: TranslateRequest = {
    text: [input.text],
    target_lang: input.targetLang,
    show_billed_characters: true,
  };
  if (input.sourceLang) body.source_lang = input.sourceLang;
  // DeepL requires an explicit source language when a glossary is used.
  if (input.glossaryId && input.sourceLang) body.glossary_id = input.glossaryId;
  if (input.formality && input.formality !== "default") body.formality = input.formality;
  if (input.context?.trim()) body.context = input.context;
  if (input.modelType) body.model_type = input.modelType;
  return body;
}

export async function translateText(client: DeepLClient, input: TranslateInput): Promise<Translation> {
  const res = await client.post<TranslateResponse>("v2/translate", { json: buildTranslateRequest(input) });
  const translation = res.translations[0];
  if (!translation) throw new Error("DeepL returned no translation");
  return translation;
}

export function getUsage(client: DeepLClient): Promise<Usage> {
  return client.get<Usage>("v2/usage");
}
