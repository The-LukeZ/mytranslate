<script lang="ts">
  import CheckIcon from "@lucide/svelte/icons/check";
  import CopyIcon from "@lucide/svelte/icons/copy";
  import { Badge } from "#lib/components/ui/badge/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Textarea } from "#lib/components/ui/textarea/index.js";
  import type { Translator } from "#lib/translator.svelte.js";
  import { langLabel } from "#lib/utils/languages.js";

  interface Props {
    translator: Translator;
  }

  let { translator }: Props = $props();

  const nf = new Intl.NumberFormat("en");
</script>

<section
  bind:this={translator.outputSection}
  aria-label="Translation"
  class="flex scroll-mt-20 flex-col rounded-3xl border bg-muted/30"
  aria-busy={translator.pending > 0}
>
  <Textarea
    bind:ref={translator.outputEl}
    bind:value={translator.output}
    aria-label="Translation"
    placeholder={translator.pending > 0 ? "Translating…" : "Translation"}
    class="min-h-32 flex-1 rounded-b-none border-0 bg-transparent p-4 text-base whitespace-pre-wrap focus-visible:ring-0 md:min-h-64 md:text-base"
    oninput={() => translator.onOutputInput()}
  />
  <div class="flex min-h-10 flex-wrap items-center gap-2 border-t px-4 py-1.5 text-xs text-muted-foreground">
    {#if translator.result}
      <Badge variant="secondary" title="Detected source language">
        Detected: {langLabel(translator.languages, translator.result.detected_source_language)}
      </Badge>
      {#if translator.result.billed_characters !== undefined}
        <span class="tabular-nums">Billed: {nf.format(translator.result.billed_characters)}</span>
      {/if}
    {/if}
    {#if translator.outputEdited && translator.result}
      <span title="Auto-translate is paused. Press Translate to replace your edits.">Edited</span>
    {/if}
    {#if translator.output.trim()}
      <Button
        variant="ghost"
        size="xs"
        class="ml-auto pointer-coarse:h-8"
        onclick={() => translator.copyOutput()}
        aria-label="Copy translation"
      >
        {#if translator.copied}<CheckIcon />Copied{:else}<CopyIcon />Copy{/if}
      </Button>
    {/if}
  </div>
</section>
