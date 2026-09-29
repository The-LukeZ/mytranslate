<script lang="ts">
  import ArrowLeftRightIcon from "@lucide/svelte/icons/arrow-left-right";
  import SlidersHorizontalIcon from "@lucide/svelte/icons/sliders-horizontal";
  import GlossarySelect from "#lib/components/glossary-select.svelte";
  import LanguageCombobox from "#lib/components/language-combobox.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import * as Tooltip from "#lib/components/ui/tooltip/index.js";
  import { prefs } from "#lib/prefs.svelte.js";
  import type { Translator } from "#lib/translator.svelte.js";
  import { baseLang } from "#lib/utils/languages.js";

  interface Props {
    translator: Translator;
    /** The language list is still loading, so the pickers can't offer anything yet. */
    languagesLoading: boolean;
    onoptions: () => void;
  }

  let { translator, languagesLoading, onoptions }: Props = $props();
</script>

<div class="mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
  <!-- Phones: source ⇄ target share one row; the pickers shrink, the swap button keeps its size. -->
  <div class="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1 sm:flex sm:gap-2">
    <LanguageCombobox
      label="Source language"
      languages={translator.sources}
      bind:value={() => prefs.sourceLang, (v) => (prefs.sourceLang = v)}
      allowAuto
      detected={!prefs.sourceLang ? translator.result?.detected_source_language : undefined}
      disabled={languagesLoading}
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
            onclick={() => translator.swap()}
          >
            <ArrowLeftRightIcon />
          </Button>
        {/snippet}
      </Tooltip.Trigger>
      <Tooltip.Content>{prefs.sourceLang ? "Swap languages" : "Choose a source language to swap"}</Tooltip.Content>
    </Tooltip.Root>
    <LanguageCombobox
      label="Target language"
      languages={translator.targets}
      bind:value={() => prefs.targetLang, (v) => (prefs.targetLang = v)}
      disabled={languagesLoading}
    />
  </div>

  <div class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 sm:ml-auto sm:flex">
    <GlossarySelect
      glossaries={translator.glossaries}
      source={prefs.sourceLang}
      target={prefs.targetLang}
      value={translator.glossaryId}
      onchange={(id) => prefs.setGlossaryFor(prefs.sourceLang, baseLang(prefs.targetLang), id)}
      disabledReason={!prefs.sourceLang ? "Choose a source language to use a glossary" : undefined}
    />
    <Button variant="outline" class="relative pointer-coarse:h-10" aria-haspopup="dialog" onclick={onoptions}>
      <SlidersHorizontalIcon />
      Options
      {#if translator.activeOptions.length > 0}
        <!-- A dot rather than a count badge, so the button never changes width. -->
        <span class="absolute -top-0.5 -right-0.5 size-2.5 rounded-full bg-primary ring-2 ring-background"></span>
        <span class="sr-only">({translator.activeOptions.length} changed)</span>
      {/if}
    </Button>
  </div>
</div>
