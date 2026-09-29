<script lang="ts">
  import BookPlusIcon from "@lucide/svelte/icons/book-plus";
  import LoaderIcon from "@lucide/svelte/icons/loader-circle";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Kbd } from "#lib/components/ui/kbd/index.js";
  import { prefs } from "#lib/prefs.svelte.js";
  import type { Translator } from "#lib/translator.svelte.js";

  interface Props {
    translator: Translator;
    onaddterm: () => void;
  }

  let { translator, onaddterm }: Props = $props();
</script>

<div class="flex items-center gap-2 md:order-last md:col-span-2">
  <Button
    size="lg"
    class="flex-1 md:min-w-48 md:flex-none pointer-coarse:h-11"
    disabled={!translator.canTranslate || translator.pending > 0}
    onclick={() => translator.doTranslate({ manual: true })}
  >
    {#if translator.pending > 0}
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
    disabled={!translator.termSource || !prefs.targetLang}
    onclick={onaddterm}
  >
    <BookPlusIcon />
    Add to glossary
  </Button>
</div>
