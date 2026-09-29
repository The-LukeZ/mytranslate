import { toast } from "svelte-sonner";
import { useDebounce } from "runed";
import { untrack } from "svelte";
import { MediaQuery } from "svelte/reactivity";
import { goto } from "$app/navigation";
import { DEFAULT_MAX_TEXT_CHARS, MAX_REQUEST_BYTES, countChars, requestBytes, type Limits } from "#lib/config.js";
import { glossariesForPair } from "#lib/components/glossary-select.svelte";
import { DEFAULT_FORMALITY, DEFAULT_MODEL, prefs } from "#lib/prefs.svelte.js";
import type { Glossary, Translation } from "#lib/server/deepl/types.js";
import { reportError } from "#lib/ui-state.svelte.js";
import {
  baseLang,
  langLabel,
  sourceLanguages,
  supportsFormality,
  swapSource,
  swapTarget,
  targetLanguages,
  type Language,
} from "#lib/utils/languages.js";
import { isSameTranslation, type TranslateEntry } from "#lib/utils/translate-history.js";
import { translate } from "#lib/remote/translate.remote.js";

interface TranslatorDeps {
  languages: () => Language[];
  glossaries: () => Glossary[];
  limits: () => Limits | undefined;
}

/**
 * State machine behind the translate page: input, result, editable output, auto-translate, and the
 * browser history entries. Construct it during page initialisation; it registers effects and a debounce.
 */
export class Translator {
  readonly #source: TranslatorDeps;

  /**
   * Read through a method: the derived fields below are initialised before the constructor assigns `#source`
   * (they only evaluate lazily), and TypeScript rejects a direct field read there.
   */
  #deps(): TranslatorDeps {
    return this.#source;
  }

  text = $state("");
  context = $state("");
  result = $state<Translation | null>(null);
  /** Editable copy of the translation; edits never trigger a translation. */
  output = $state("");
  /** True once the user edits the translation; auto-translate then pauses until Translate is pressed. */
  outputEdited = $state(false);
  copied = $state(false);

  sourceEl = $state<HTMLTextAreaElement | null>(null);
  outputEl = $state<HTMLTextAreaElement | null>(null);
  outputSection = $state<HTMLElement | null>(null);

  readonly #reducedMotion = new MediaQuery("(prefers-reduced-motion: reduce)");

  // ── Derived state ──────────────────────────────────────────────────────────
  readonly languages = $derived(this.#deps().languages());
  readonly glossaries = $derived(this.#deps().glossaries());
  readonly sources = $derived(sourceLanguages(this.languages));
  readonly targets = $derived(targetLanguages(this.languages));
  readonly maxChars = $derived(this.#deps().limits()?.maxTextChars ?? DEFAULT_MAX_TEXT_CHARS);
  readonly maxBytes = $derived(this.#deps().limits()?.maxRequestBytes ?? MAX_REQUEST_BYTES);

  readonly chars = $derived(countChars(this.text));
  readonly bytes = $derived(requestBytes(this.text, this.context));
  readonly overChars = $derived(this.chars > this.maxChars);
  readonly overBytes = $derived(this.bytes > this.maxBytes);
  readonly canTranslate = $derived(
    this.text.trim().length > 0 && !this.overChars && !this.overBytes && !!prefs.targetLang,
  );

  readonly formalityAvailable = $derived(supportsFormality(this.languages, prefs.targetLang));
  readonly formalityHint = $derived(
    !this.formalityAvailable && prefs.targetLang
      ? `Formality is not available for ${langLabel(this.languages, prefs.targetLang)}`
      : undefined,
  );

  readonly glossaryOptions = $derived(glossariesForPair(this.glossaries, prefs.sourceLang, prefs.targetLang));
  /** The remembered glossary for this pair, dropped when it no longer fits. */
  readonly glossaryId = $derived.by(() => {
    if (!prefs.sourceLang) return "";
    const id = prefs.glossaryFor(prefs.sourceLang, baseLang(prefs.targetLang));
    return id && this.glossaryOptions.some((g) => g.glossary_id === id) ? id : "";
  });

  /** Language pair for "Add to glossary": explicit or detected source, base target. */
  readonly termSource = $derived(
    prefs.sourceLang ? baseLang(prefs.sourceLang) : this.result ? baseLang(this.result.detected_source_language) : "",
  );

  /** Options that differ from the defaults, for the Options button's indicator. */
  readonly activeOptions = $derived(
    [
      this.formalityAvailable && prefs.formality !== DEFAULT_FORMALITY && "formality",
      prefs.modelType !== DEFAULT_MODEL && "model",
      this.context.trim() && "context",
    ].filter(Boolean) as string[],
  );

  /** The request for the current input, or null when there's nothing valid to translate. */
  readonly request = $derived(
    this.canTranslate
      ? {
          text: this.text,
          targetLang: prefs.targetLang,
          sourceLang: prefs.sourceLang || undefined,
          glossaryId: this.glossaryId || undefined,
          formality: this.formalityAvailable ? prefs.formality : undefined,
          context: this.context.trim() ? this.context : undefined,
          modelType: prefs.modelType,
        }
      : null,
  );
  readonly requestKey = $derived(this.request ? JSON.stringify(this.request) : "");

  /** The user's input, without options that load late (glossary, formality); see `#restoredInput`. */
  readonly inputKey = $derived(JSON.stringify([this.text, this.context, prefs.sourceLang, prefs.targetLang]));

  /** Key of the last request sent, so an unchanged input is never billed twice. */
  #sentKey = "";
  /**
   * Input of a restored, already translated history entry. Auto-translate waits until the input changes,
   * even if `requestKey` shifts as glossaries and languages load after a reload.
   */
  #restoredInput = "";
  /** Bumped per request; only the newest response may land, however they arrive. */
  #seq = 0;

  // ── History ────────────────────────────────────────────────────────────────
  // Each distinct translation gets its own browser history entry, so back/forward cycles through them.
  // Entries live in SvelteKit snapshots (per tab, sessionStorage), never in the URL or on the server.

  /** The current history entry as of its last translation; a new translation is compared against it. */
  #landed: TranslateEntry | null = null;
  /** While our own push leaves an entry, that entry keeps its last translation rather than the new input. */
  #leaving: TranslateEntry | null | undefined;

  /** Translate automatically once the input has been still for a second. */
  readonly #autoTranslate = useDebounce(() => this.doTranslate(), 1000);

  constructor(deps: TranslatorDeps) {
    this.#source = deps;

    $effect(() => {
      if (
        !this.requestKey ||
        this.requestKey === this.#sentKey ||
        this.outputEdited ||
        this.inputKey === this.#restoredInput
      )
        return;
      untrack(() => this.#autoTranslate().catch(() => {})); // a newer keystroke cancelled it
    });

    // An empty source means nothing to show: clear the translation, unless the user wrote it.
    $effect(() => {
      if (this.text.trim()) return;
      untrack(() => {
        if (!this.outputEdited && (this.result || this.output || this.#sentKey)) this.#resetOutput();
      });
    });
  }

  /** Requests currently in flight. */
  get pending(): number {
    return translate.pending;
  }

  // ── Actions ────────────────────────────────────────────────────────────────
  async doTranslate({ manual = false } = {}) {
    this.#autoTranslate.cancel();
    const request = this.request;
    if (!request) return;
    const requestKey = this.requestKey;
    if (requestKey === this.#sentKey) {
      // Same input: pressing Translate restores the last translation over manual edits, without re-billing.
      if (manual && this.outputEdited && this.result) {
        this.output = this.result.text;
        this.outputEdited = false;
      }
      return;
    }
    const mine = ++this.#seq;
    this.#sentKey = requestKey;
    try {
      const next = await translate(request);
      if (mine !== this.#seq) return;
      this.result = next;
      // Keep the user's edits; only Translate replaces them.
      if (!this.outputEdited || manual) {
        this.output = next.text;
        this.outputEdited = false;
        if (manual) this.#revealOutput();
      }
      void this.#recordEntry();
    } catch (e) {
      if (mine !== this.#seq) return;
      this.#sentKey = ""; // let the same input be retried
      reportError(e, "Translation failed");
    }
  }

  /** Drop the translation and any in-flight request. */
  #resetOutput() {
    this.#autoTranslate.cancel();
    this.#seq++;
    this.#sentKey = "";
    this.result = null;
    this.output = "";
    this.outputEdited = false;
  }

  /** On stacked layouts the translation lands below the fold; bring its top into view. */
  #revealOutput() {
    if (!this.outputSection) return;
    if (this.outputSection.getBoundingClientRect().top < window.innerHeight * 0.6) return;
    this.outputSection.scrollIntoView({ block: "start", behavior: this.#reducedMotion.current ? "auto" : "smooth" });
  }

  swap() {
    if (!prefs.sourceLang) return;
    const nextSource = swapSource(this.sources, prefs.targetLang);
    const nextTarget = swapTarget(this.targets, prefs.sourceLang, prefs.lastVariants);
    if (!nextSource || !nextTarget) {
      toast.error("These languages can't be swapped.");
      return;
    }
    prefs.sourceLang = nextSource;
    prefs.targetLang = nextTarget;
    if (this.output.trim()) {
      const prevText = this.text;
      const prevOutput = this.output;
      this.#resetOutput();
      this.text = prevOutput;
      this.output = prevText;
      this.#sentKey = this.requestKey; // the output already shows this pair; don't bill a round trip
      void this.#recordEntry(); // back undoes the swap
    }
  }

  async copyOutput() {
    if (!this.output.trim()) return;
    try {
      await navigator.clipboard.writeText(this.output);
      this.copied = true;
      setTimeout(() => (this.copied = false), 1500);
    } catch {
      toast.error("Couldn't copy to the clipboard.");
    }
  }

  onOutputInput() {
    this.outputEdited = true;
    this.#autoTranslate.cancel();
    // Edits belong to the translation shown, so this entry keeps them even if a new one is pushed later.
    if (this.#landed) this.#landed = { ...this.#landed, output: this.output, outputEdited: this.outputEdited };
  }

  clear() {
    this.text = "";
    // Explicit clear also drops edited output, which the empty-source effect keeps.
    this.#resetOutput();
    this.sourceEl?.focus();
  }

  // ── History entries ────────────────────────────────────────────────────────
  #liveEntry(): TranslateEntry {
    return {
      text: this.text,
      context: this.context,
      sourceLang: prefs.sourceLang,
      targetLang: prefs.targetLang,
      output: this.output,
      outputEdited: this.outputEdited,
      result: $state.snapshot(this.result),
      translated: !!this.requestKey && (this.requestKey === this.#sentKey || this.inputKey === this.#restoredInput),
    };
  }

  /** What the browser history snapshot stores for the current entry. */
  capture(): TranslateEntry | null {
    return this.#leaving !== undefined ? this.#leaving : this.#liveEntry();
  }

  /** Record the translation now shown: a continuation stays in this entry, anything else pushes a new one. */
  async #recordEntry() {
    const prev = this.#landed;
    this.#landed = this.#liveEntry();
    if (prev && isSameTranslation(prev, this.#landed)) return;
    this.#leaving = prev;
    try {
      await goto("", { shallow: true });
    } finally {
      this.#leaving = undefined;
    }
  }

  /** Restore a history entry (browser back/forward, reload). */
  applyEntry(entry: TranslateEntry | null) {
    this.#autoTranslate.cancel();
    this.#seq++; // a late response must not overwrite the restored entry
    this.#landed = entry;
    if (entry) {
      prefs.sourceLang = entry.sourceLang;
      prefs.targetLang = entry.targetLang;
    }
    this.text = entry?.text ?? "";
    this.context = entry?.context ?? "";
    this.result = entry?.result ?? null;
    this.output = entry?.output ?? "";
    this.outputEdited = entry?.outputEdited ?? false;
    this.#sentKey = entry?.translated ? this.requestKey : "";
    this.#restoredInput = entry?.translated ? this.inputKey : "";
  }
}
