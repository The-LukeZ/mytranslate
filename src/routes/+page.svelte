<script lang="ts">
  import AddTermDialog from "#lib/components/add-term-dialog.svelte";
  import TranslateActions from "#lib/components/translate-actions.svelte";
  import TranslateControls from "#lib/components/translate-controls.svelte";
  import TranslateOptions from "#lib/components/translate-options.svelte";
  import TranslateOutputPane from "#lib/components/translate-output-pane.svelte";
  import TranslateSourcePane from "#lib/components/translate-source-pane.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import { prefs } from "#lib/prefs.svelte.js";
  import { listGlossaries } from "#lib/remote/glossaries.remote.js";
  import { getLanguages, getLimits } from "#lib/remote/meta.remote.js";
  import { Translator } from "#lib/translator.svelte.js";
  import { baseLang } from "#lib/utils/languages.js";
  import { pickSelection } from "#lib/utils/textarea.js";
  import type { TranslateEntry } from "#lib/utils/translate-history.js";
  import { snapshot } from "$app/navigation";

  const languagesQuery = getLanguages("translate_text");
  const limitsQuery = getLimits();
  const glossariesQuery = listGlossaries();

  const translator = new Translator({
    languages: () => languagesQuery.current ?? [],
    glossaries: () => glossariesQuery.current ?? [],
    limits: () => limitsQuery.current,
  });

  snapshot<TranslateEntry | null>({
    id: "translate",
    capture: () => translator.capture(),
    restore: (entry) => translator.applyEntry(entry),
  });

  let addTermOpen = $state(false);
  let optionsOpen = $state(false);
  let addTermPrefill = $state({ source: "", target: "" });

  function openAddTerm() {
    addTermPrefill = {
      source: pickSelection(translator.sourceEl, translator.text),
      target: pickSelection(translator.outputEl, translator.output),
    };
    addTermOpen = true;
  }

  function onkeydown(e: KeyboardEvent) {
    const mod = e.ctrlKey || e.metaKey;
    if (!mod) return;
    if (e.key === "Enter") {
      e.preventDefault();
      void translator.doTranslate({ manual: true });
    } else if (e.shiftKey && e.key.toLowerCase() === "c" && translator.output.trim()) {
      e.preventDefault();
      void translator.copyOutput();
    }
  }
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

<TranslateControls
  {translator}
  languagesLoading={languagesQuery.loading && !languagesQuery.current}
  onoptions={() => (optionsOpen = true)}
/>

<TranslateOptions
  bind:open={optionsOpen}
  bind:context={translator.context}
  formalityUnavailable={translator.formalityHint}
/>

<!-- Panes. On phones the actions sit between source and translation, right under the text being typed;
     from md up the panes go side by side and the actions move below both. -->
<div class="grid gap-3 md:grid-cols-2 md:gap-4">
  <TranslateSourcePane {translator} />
  <TranslateActions {translator} onaddterm={openAddTerm} />
  <TranslateOutputPane {translator} />
</div>

<AddTermDialog
  bind:open={addTermOpen}
  glossaries={translator.glossaries}
  sourceLang={translator.termSource}
  targetLang={baseLang(prefs.targetLang)}
  initialSource={addTermPrefill.source}
  initialTarget={addTermPrefill.target}
/>
