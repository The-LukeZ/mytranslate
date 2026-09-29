<script lang="ts">
  import XIcon from "@lucide/svelte/icons/x";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Textarea } from "#lib/components/ui/textarea/index.js";
  import type { Translator } from "#lib/translator.svelte.js";
  import { cn } from "#lib/utils.js";

  interface Props {
    translator: Translator;
  }

  let { translator }: Props = $props();

  const nf = new Intl.NumberFormat("en");
</script>

<section aria-label="Source text" class="flex flex-col rounded-3xl border bg-card">
  <Textarea
    bind:ref={translator.sourceEl}
    bind:value={translator.text}
    aria-label="Text to translate"
    aria-invalid={translator.overChars || translator.overBytes}
    placeholder="Type or paste text…"
    class="max-h-[45dvh] min-h-40 flex-1 rounded-b-none border-0 bg-transparent p-4 text-base focus-visible:ring-0 md:max-h-none md:min-h-64 md:text-base"
  />
  <div class="flex min-h-10 items-center gap-2 border-t px-4 py-1.5 text-xs text-muted-foreground">
    <span
      class={cn("tabular-nums", (translator.overChars || translator.overBytes) && "font-medium text-destructive")}
      aria-live="polite"
    >
      {nf.format(translator.chars)} / {nf.format(translator.maxChars)}
      {#if translator.overBytes && !translator.overChars}· too large for one request{/if}
    </span>
    {#if translator.text}
      <Button variant="ghost" size="xs" class="ml-auto pointer-coarse:h-8" onclick={() => translator.clear()}>
        <XIcon />
        Clear
      </Button>
    {/if}
  </div>
</section>
