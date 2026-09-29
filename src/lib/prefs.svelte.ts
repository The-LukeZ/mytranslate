import { browser } from "$app/env";

export type FormalityPref = "default" | "prefer_more" | "prefer_less";
export type ModelPref = "prefer_quality_optimized" | "latency_optimized" | "quality_optimized";

interface PrefsData {
  /** Empty string means auto-detect. */
  sourceLang: string;
  targetLang: string;
  /** Glossary per `source→target` pair (base codes). */
  glossaryByPair: Record<string, string>;
  /** Last regional variant used per base code, e.g. `{ en: "en-GB" }`. */
  lastVariants: Record<string, string>;
  formality: FormalityPref;
  modelType: ModelPref;
}

const KEY = "mytranslate:prefs";

export const DEFAULT_FORMALITY: FormalityPref = "default";
export const DEFAULT_MODEL: ModelPref = "prefer_quality_optimized";

const DEFAULTS: PrefsData = {
  sourceLang: "",
  targetLang: "en-US",
  glossaryByPair: {},
  lastVariants: { en: "en-US", pt: "pt-BR" },
  formality: DEFAULT_FORMALITY,
  modelType: DEFAULT_MODEL,
};

function load(): PrefsData {
  if (!browser) return structuredClone(DEFAULTS);
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULTS);
    // `optionsOpen` was stored by older versions, when the options were an inline panel.
    const { optionsOpen: _, ...parsed } = JSON.parse(raw) as Partial<PrefsData> & { optionsOpen?: unknown };
    return { ...structuredClone(DEFAULTS), ...parsed };
  } catch {
    return structuredClone(DEFAULTS);
  }
}

export const pairKey = (source: string, target: string) => `${source.toLowerCase()}→${target.toLowerCase()}`;

/**
 * Translate-page preferences, persisted to localStorage. Text and context are never saved.
 * Storage can be unavailable (private mode, blocked site data), so every access is guarded.
 */
class Prefs {
  #data = $state<PrefsData>(load());

  #save() {
    if (!browser) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(this.#data));
    } catch {
      // Storage full or blocked: preferences just won't persist.
    }
  }

  #set<K extends keyof PrefsData>(key: K, value: PrefsData[K]) {
    this.#data[key] = value;
    this.#save();
  }

  get sourceLang() {
    return this.#data.sourceLang;
  }
  set sourceLang(v: string) {
    this.#set("sourceLang", v);
  }

  get targetLang() {
    return this.#data.targetLang;
  }
  set targetLang(v: string) {
    this.#set("targetLang", v);
    const base = v.split("-")[0]!.toLowerCase();
    if (base !== v.toLowerCase()) this.#set("lastVariants", { ...this.#data.lastVariants, [base]: v });
  }

  get lastVariants() {
    return this.#data.lastVariants;
  }

  get formality() {
    return this.#data.formality;
  }
  set formality(v: FormalityPref) {
    this.#set("formality", v);
  }

  get modelType() {
    return this.#data.modelType;
  }
  set modelType(v: ModelPref) {
    this.#set("modelType", v);
  }

  glossaryFor(source: string, target: string): string | undefined {
    return this.#data.glossaryByPair[pairKey(source, target)];
  }

  setGlossaryFor(source: string, target: string, id: string | undefined) {
    const next = { ...this.#data.glossaryByPair };
    if (id) next[pairKey(source, target)] = id;
    else delete next[pairKey(source, target)];
    this.#set("glossaryByPair", next);
  }
}

export const prefs = new Prefs();
