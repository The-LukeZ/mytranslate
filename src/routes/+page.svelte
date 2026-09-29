<script lang="ts">
  import ArrowLeftRightIcon from "@lucide/svelte/icons/arrow-left-right";
  import BookPlusIcon from "@lucide/svelte/icons/book-plus";
  import CheckIcon from "@lucide/svelte/icons/check";
  import CopyIcon from "@lucide/svelte/icons/copy";
  import LoaderIcon from "@lucide/svelte/icons/loader-circle";
  import SlidersHorizontalIcon from "@lucide/svelte/icons/sliders-horizontal";
  import XIcon from "@lucide/svelte/icons/x";
  import { toast } from "svelte-sonner";
  import { useDebounce } from "runed";
  import { untrack } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
  import { goto, snapshot } from "$app/navigation";
  import AddTermDialog from "#lib/components/add-term-dialog.svelte";
  import GlossarySelect, { glossariesForPair } from "#lib/components/glossary-select.svelte";
  import LanguageCombobox from "#lib/components/language-combobox.svelte";
  import TranslateOptions from "#lib/components/translate-options.svelte";
  import { Badge } from "#lib/components/ui/badge/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Kbd } from "#lib/components/ui/kbd/index.js";
  import { Textarea } from "#lib/components/ui/textarea/index.js";
  import * as Tooltip from "#lib/components/ui/tooltip/index.js";
  import { DEFAULT_MAX_TEXT_CHARS, MAX_REQUEST_BYTES, countChars, requestBytes } from "#lib/config.js";
  import {
    baseLang,
    langLabel,
    sourceLanguages,
    supportsFormality,
    swapSource,
    swapTarget,
    targetLanguages,
  } from "#lib/languages.js";
  import { DEFAULT_FORMALITY, DEFAULT_MODEL, prefs } from "#lib/prefs.svelte.js";
  import type { Translation } from "#lib/server/deepl/types.js";
  import { isSameTranslation, type TranslateEntry } from "#lib/translate-history.js";
  import { reportError } from "#lib/ui-state.svelte.js";
  import { cn } from "#lib/utils.js";
  import { listGlossaries } from "./glossaries.remote";
  import { getLanguages, getLimits } from "./meta.remote";
  import { translate } from "./translate.remote";

  const languagesQuery = getLanguages("translate_text");
  const limitsQuery = getLimits();
  const glossariesQuery = listGlossaries();

  const languages = $derived(languagesQuery.current ?? []);
  const sources = $derived(sourceLanguages(languages));
  const targets = $derived(targetLanguages(languages));
  const maxChars = $derived(limitsQuery.current?.maxTextChars ?? DEFAULT_MAX_TEXT_CHARS);
  const maxBytes = $derived(limitsQuery.current?.maxRequestBytes ?? MAX_REQUEST_BYTES);

  let text = $state("");
  let context = $state("");
  let result = $state<Translation | null>(null);
  /** Editable copy of the translation; edits never trigger a translation. */
  let output = $state("");
  /** True once the user edits the translation; auto-translate then pauses until Translate is pressed. */
  let outputEdited = $state(false);
  let copied = $state(false);
  let addTermOpen = $state(false);
  let optionsOpen = $state(false);
  let addTermPrefill = $state({ source: "", target: "" });

  let sourceEl = $state<HTMLTextAreaElement | null>(null);
  let outputEl = $state<HTMLTextAreaElement | null>(null);
  let outputSection = $state<HTMLElement | null>(null);

  const reducedMotion = new MediaQuery("(prefers-reduced-motion: reduce)");

  // ── Derived state ──────────────────────────────────────────────────────────
  const chars = $derived(countChars(text));
  const bytes = $derived(requestBytes(text, context));
  const overChars = $derived(chars > maxChars);
  const overBytes = $derived(bytes > maxBytes);
  const canTranslate = $derived(text.trim().length > 0 && !overChars && !overBytes && !!prefs.targetLang);

  const formalityAvailable = $derived(supportsFormality(languages, prefs.targetLang));
  const formalityHint = $derived(
    !formalityAvailable && prefs.targetLang
      ? `Formality is not available for ${langLabel(languages, prefs.targetLang)}`
      : undefined,
  );

  const glossaryOptions = $derived(
    glossariesForPair(glossariesQuery.current ?? [], prefs.sourceLang, prefs.targetLang),
  );
  /** The remembered glossary for this pair, dropped when it no longer fits. */
  const glossaryId = $derived.by(() => {
    if (!prefs.sourceLang) return "";
    const id = prefs.glossaryFor(prefs.sourceLang, baseLang(prefs.targetLang));
    return id && glossaryOptions.some((g) => g.glossary_id === id) ? id : "";
  });

  /** Language pair for "Add to glossary": explicit or detected source, base target. */
  const termSource = $derived(
    prefs.sourceLang ? baseLang(prefs.sourceLang) : result ? baseLang(result.detected_source_language) : "",
  );

  /** Options that differ from the defaults, for the Options button's indicator. */
  const activeOptions = $derived(
    [
      formalityAvailable && prefs.formality !== DEFAULT_FORMALITY && "formality",
      prefs.modelType !== DEFAULT_MODEL && "model",
      context.trim() && "context",
    ].filter(Boolean) as string[],
  );

  /** The request for the current input, or null when there's nothing valid to translate. */
  const request = $derived(
    canTranslate
      ? {
          text,
          targetLang: prefs.targetLang,
          sourceLang: prefs.sourceLang || undefined,
          glossaryId: glossaryId || undefined,
          formality: formalityAvailable ? prefs.formality : undefined,
          context: context.trim() ? context : undefined,
          modelType: prefs.modelType,
        }
      : null,
  );
  const requestKey = $derived(request ? JSON.stringify(request) : "");

  /** Key of the last request sent, so an unchanged input is never billed twice. */
  let sentKey = "";
  /** The user's input, without options that load late (glossary, formality); see `restoredInput`. */
  const inputKey = $derived(JSON.stringify([text, context, prefs.sourceLang, prefs.targetLang]));
  /**
   * Input of a restored, already translated history entry. Auto-translate waits until the input changes,
   * even if `requestKey` shifts as glossaries and languages load after a reload.
   */
  let restoredInput = "";
  /** Bumped per request; only the newest response may land, however they arrive. */
  let seq = 0;

  // ── Actions ────────────────────────────────────────────────────────────────
  async function doTranslate({ manual = false } = {}) {
    autoTranslate.cancel();
    if (!request) return;
    if (requestKey === sentKey) {
      // Same input: pressing Translate restores the last translation over manual edits, without re-billing.
      if (manual && outputEdited && result) {
        output = result.text;
        outputEdited = false;
      }
      return;
    }
    const mine = ++seq;
    sentKey = requestKey;
    try {
      const next = await translate(request);
      if (mine !== seq) return;
      result = next;
      // Keep the user's edits; only Translate replaces them.
      if (!outputEdited || manual) {
        output = next.text;
        outputEdited = false;
        if (manual) revealOutput();
      }
      void recordEntry();
    } catch (e) {
      if (mine !== seq) return;
      sentKey = ""; // let the same input be retried
      reportError(e, "Translation failed");
    }
  }

  // Translate automatically once the input has been still for a second.
  const autoTranslate = useDebounce(() => doTranslate(), 1000);
  $effect(() => {
    if (!requestKey || requestKey === sentKey || outputEdited || inputKey === restoredInput) return;
    untrack(() => autoTranslate().catch(() => {})); // a newer keystroke cancelled it
  });

  // ── History ────────────────────────────────────────────────────────────────
  // Each distinct translation gets its own browser history entry, so back/forward cycles through them.
  // Entries live in SvelteKit snapshots (per tab, sessionStorage), never in the URL or on the server.

  /** The current history entry as of its last translation; a new translation is compared against it. */
  let landed: TranslateEntry | null = null;
  /** While our own push leaves an entry, that entry keeps its last translation rather than the new input. */
  let leaving: TranslateEntry | null | undefined;

  function liveEntry(): TranslateEntry {
    return {
      text,
      context,
      sourceLang: prefs.sourceLang,
      targetLang: prefs.targetLang,
      output,
      outputEdited,
      result: $state.snapshot(result),
      translated: !!requestKey && (requestKey === sentKey || inputKey === restoredInput),
    };
  }

  snapshot<TranslateEntry | null>({
    id: "translate",
    capture: () => (leaving !== undefined ? leaving : liveEntry()),
    restore: applyEntry,
  });

  /** Record the translation now shown: a continuation stays in this entry, anything else pushes a new one. */
  async function recordEntry() {
    const prev = landed;
    landed = liveEntry();
    if (prev && isSameTranslation(prev, landed)) return;
    leaving = prev;
    try {
      await goto("", { shallow: true });
    } finally {
      leaving = undefined;
    }
  }

  function applyEntry(entry: TranslateEntry | null) {
    autoTranslate.cancel();
    seq++; // a late response must not overwrite the restored entry
    landed = entry;
    if (entry) {
      prefs.sourceLang = entry.sourceLang;
      prefs.targetLang = entry.targetLang;
    }
    text = entry?.text ?? "";
    context = entry?.context ?? "";
    result = entry?.result ?? null;
    output = entry?.output ?? "";
    outputEdited = entry?.outputEdited ?? false;
    sentKey = entry?.translated ? requestKey : "";
    restoredInput = entry?.translated ? inputKey : "";
  }

  /** Drop the translation and any in-flight request. */
  function resetOutput() {
    autoTranslate.cancel();
    seq++;
    sentKey = "";
    result = null;
    output = "";
    outputEdited = false;
  }

  // An empty source means nothing to show: clear the translation, unless the user wrote it.
  $effect(() => {
    if (text.trim()) return;
    untrack(() => {
      if (!outputEdited && (result || output || sentKey)) resetOutput();
    });
  });

  /** On stacked layouts the translation lands below the fold; bring its top into view. */
  function revealOutput() {
    if (!outputSection) return;
    if (outputSection.getBoundingClientRect().top < window.innerHeight * 0.6) return;
    outputSection.scrollIntoView({ block: "start", behavior: reducedMotion.current ? "auto" : "smooth" });
  }

  function swap() {
    if (!prefs.sourceLang) return;
    const nextSource = swapSource(sources, prefs.targetLang);
    const nextTarget = swapTarget(targets, prefs.sourceLang, prefs.lastVariants);
    if (!nextSource || !nextTarget) {
      toast.error("These languages can't be swapped.");
      return;
    }
    prefs.sourceLang = nextSource;
    prefs.targetLang = nextTarget;
    if (output.trim()) {
      const prevText = text;
      const prevOutput = output;
      resetOutput();
      text = prevOutput;
      output = prevText;
      sentKey = requestKey; // the output already shows this pair; don't bill a round trip
      void recordEntry(); // back undoes the swap
    }
  }

  async function copyOutput() {
    if (!output.trim()) return;
    try {
      await navigator.clipboard.writeText(output);
      copied = true;
      setTimeout(() => (copied = false), 1500);
    } catch {
      toast.error("Couldn't copy to the clipboard.");
    }
  }

  function onOutputInput() {
    outputEdited = true;
    autoTranslate.cancel();
    // Edits belong to the translation shown, so this entry keeps them even if a new one is pushed later.
    if (landed) landed = { ...landed, output, outputEdited };
  }

  function clear() {
    text = "";
    // Explicit clear also drops edited output, which the empty-source effect keeps.
    resetOutput();
    sourceEl?.focus();
  }

  /** The selected text of a textarea, or its whole value if short and single-line. */
  function pick(el: HTMLTextAreaElement | null, fallback: string): string {
    if (el && el.selectionStart !== el.selectionEnd) return el.value.slice(el.selectionStart, el.selectionEnd).trim();
    const whole = fallback.trim();
    return whole && !/[\r\n\t]/.test(whole) && new TextEncoder().encode(whole).length <= 1024 ? whole : "";
  }

  function openAddTerm() {
    addTermPrefill = { source: pick(sourceEl, text), target: pick(outputEl, output) };
    addTermOpen = true;
  }

  function onkeydown(e: KeyboardEvent) {
    const mod = e.ctrlKey || e.metaKey;
    if (!mod) return;
    if (e.key === "Enter") {
      e.preventDefault();
      void doTranslate({ manual: true });
    } else if (e.shiftKey && e.key.toLowerCase() === "c" && output.trim()) {
      e.preventDefault();
      void copyOutput();
    }
  }

  const nf = new Intl.NumberFormat("en");
</script>

<svelte:head><title>Translate · mytranslate</title></svelte:head>
<svelte:window {onkeydown} />

<h1 class="sr-only">Translate</h1>

{#if languagesQuery.error}
  <div
    role="alert"
    class="mb-4 flex items-center gap-3 rounded-2xl border border-destructive/30 bg-destructive/10 p-3 text-sm"
  >
    <span class="flex-1">Couldn't load languages: {languagesQuery.error.message}</span>
    <Button size="sm" variant="outline" onclick={() => languagesQuery.refresh()}>Retry</Button>
  </div>
{/if}

<!-- Controls -->
<div class="mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
  <!-- Phones: source ⇄ target share one row; the pickers shrink, the swap button keeps its size. -->
  <div class="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1 sm:flex sm:gap-2">
    <LanguageCombobox
      label="Source language"
      languages={sources}
      bind:value={() => prefs.sourceLang, (v) => (prefs.sourceLang = v)}
      allowAuto
      detected={!prefs.sourceLang ? result?.detected_source_language : undefined}
      disabled={languagesQuery.loading && !languagesQuery.current}
    />
    <Tooltip.Root>
      <Tooltip.Trigger>
        {#snippet child({ props })}
          <Button
            {...props}
            variant="ghost"
            size="icon"
            class="pointer-coarse:size-10"
            aria-label="Swap languages"
            disabled={!prefs.sourceLang}
            onclick={swap}
          >
            <ArrowLeftRightIcon />
          </Button>
        {/snippet}
      </Tooltip.Trigger>
      <Tooltip.Content>{prefs.sourceLang ? "Swap languages" : "Choose a source language to swap"}</Tooltip.Content>
    </Tooltip.Root>
    <LanguageCombobox
      label="Target language"
      languages={targets}
      bind:value={() => prefs.targetLang, (v) => (prefs.targetLang = v)}
      disabled={languagesQuery.loading && !languagesQuery.current}
    />
  </div>

  <div class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 sm:ml-auto sm:flex">
    <GlossarySelect
      glossaries={glossariesQuery.current ?? []}
      source={prefs.sourceLang}
      target={prefs.targetLang}
      value={glossaryId}
      onchange={(id) => prefs.setGlossaryFor(prefs.sourceLang, baseLang(prefs.targetLang), id)}
      disabledReason={!prefs.sourceLang ? "Choose a source language to use a glossary" : undefined}
    />
    <Button
      variant="outline"
      class="relative pointer-coarse:h-10"
      aria-haspopup="dialog"
      onclick={() => (optionsOpen = true)}
    >
      <SlidersHorizontalIcon />
      Options
      {#if activeOptions.length > 0}
        <!-- A dot rather than a count badge, so the button never changes width. -->
        <span class="absolute -top-0.5 -right-0.5 size-2.5 rounded-full bg-primary ring-2 ring-background"></span>
        <span class="sr-only">({activeOptions.length} changed)</span>
      {/if}
    </Button>
  </div>
</div>

<TranslateOptions bind:open={optionsOpen} bind:context formalityUnavailable={formalityHint} />

<!-- Panes. On phones the actions sit between source and translation, right under the text being typed;
     from md up the panes go side by side and the actions move below both. -->
<div class="grid gap-3 md:grid-cols-2 md:gap-4">
  <section aria-label="Source text" class="flex flex-col rounded-3xl border bg-card">
    <Textarea
      bind:ref={sourceEl}
      bind:value={text}
      aria-label="Text to translate"
      aria-invalid={overChars || overBytes}
      placeholder="Type or paste text…"
      class="max-h-[45dvh] min-h-40 flex-1 rounded-b-none border-0 bg-transparent p-4 text-base focus-visible:ring-0 md:max-h-none md:min-h-64 md:text-base"
    />
    <div class="flex min-h-10 items-center gap-2 border-t px-4 py-1.5 text-xs text-muted-foreground">
      <span class={cn("tabular-nums", (overChars || overBytes) && "font-medium text-destructive")} aria-live="polite">
        {nf.format(chars)} / {nf.format(maxChars)}
        {#if overBytes && !overChars}· too large for one request{/if}
      </span>
      {#if text}
        <Button variant="ghost" size="xs" class="ml-auto pointer-coarse:h-8" onclick={clear}>
          <XIcon />
          Clear
        </Button>
      {/if}
    </div>
  </section>

  <div class="flex items-center gap-2 md:order-last md:col-span-2">
    <Button
      size="lg"
      class="flex-1 md:min-w-48 md:flex-none pointer-coarse:h-11"
      disabled={!canTranslate || translate.pending > 0}
      onclick={() => doTranslate({ manual: true })}
    >
      {#if translate.pending > 0}
        <LoaderIcon class="motion-safe:animate-spin" />
        Translating…
      {:else}
        Translate
        <span class="ml-1 hidden items-center gap-0.5 opacity-70 pointer-fine:inline-flex"
          ><Kbd>Ctrl</Kbd><Kbd>↵</Kbd></span
        >
      {/if}
    </Button>
    <Button
      variant="outline"
      size="lg"
      class="md:ml-auto pointer-coarse:h-11"
      disabled={!termSource || !prefs.targetLang}
      onclick={openAddTerm}
    >
      <BookPlusIcon />
      Add to glossary
    </Button>
  </div>

  <section
    bind:this={outputSection}
    aria-label="Translation"
    class="flex scroll-mt-20 flex-col rounded-3xl border bg-muted/30"
    aria-busy={translate.pending > 0}
  >
    <Textarea
      bind:ref={outputEl}
      bind:value={output}
      aria-label="Translation"
      placeholder={translate.pending > 0 ? "Translating…" : "Translation"}
      class="min-h-32 flex-1 rounded-b-none border-0 bg-transparent p-4 text-base whitespace-pre-wrap focus-visible:ring-0 md:min-h-64 md:text-base"
      oninput={onOutputInput}
    />
    <div class="flex min-h-10 flex-wrap items-center gap-2 border-t px-4 py-1.5 text-xs text-muted-foreground">
      {#if result}
        <Badge variant="secondary" title="Detected source language">
          Detected: {langLabel(languages, result.detected_source_language)}
        </Badge>
        {#if result.billed_characters !== undefined}
          <span class="tabular-nums">Billed: {nf.format(result.billed_characters)}</span>
        {/if}
      {/if}
      {#if outputEdited && result}
        <span title="Auto-translate is paused. Press Translate to replace your edits.">Edited</span>
      {/if}
      {#if output.trim()}
        <Button
          variant="ghost"
          size="xs"
          class="ml-auto pointer-coarse:h-8"
          onclick={copyOutput}
          aria-label="Copy translation"
        >
          {#if copied}<CheckIcon />Copied{:else}<CopyIcon />Copy{/if}
        </Button>
      {/if}
    </div>
  </section>
</div>

<AddTermDialog
  bind:open={addTermOpen}
  glossaries={glossariesQuery.current ?? []}
  sourceLang={termSource}
  targetLang={baseLang(prefs.targetLang)}
  initialSource={addTermPrefill.source}
  initialTarget={addTermPrefill.target}
/>
