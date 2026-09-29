<script lang="ts" module>
  import type { Glossary } from "#lib/server/deepl/types.js";
  import { baseLang, sameLang } from "#lib/languages.js";

  /** Glossaries with a dictionary for `(source, baseLang(target))`. */
  export function glossariesForPair(glossaries: Glossary[], source: string, target: string): Glossary[] {
    if (!source || !target) return [];
    const s = baseLang(source);
    const t = baseLang(target);
    return glossaries.filter((g) =>
      g.dictionaries.some((d) => sameLang(d.source_lang, s) && sameLang(d.target_lang, t)),
    );
  }
</script>

<script lang="ts">
  import BookOpenIcon from "@lucide/svelte/icons/book-open";
  import * as Select from "#lib/components/ui/select/index.js";
  import * as Tooltip from "#lib/components/ui/tooltip/index.js";
  import { cn } from "#lib/utils.js";

  interface Props {
    glossaries: Glossary[];
    source: string;
    target: string;
    /** Glossary id, or empty string for none. */
    value: string;
    disabledReason?: string;
    class?: string;
    onchange?: (value: string) => void;
  }

  let { glossaries, source, target, value = $bindable(), disabledReason, class: className, onchange }: Props = $props();

  const NONE = "__none__";

  const options = $derived(glossariesForPair(glossaries, source, target));
  const selected = $derived(options.find((g) => g.glossary_id === value));
  const disabled = $derived(!!disabledReason);

  function set(next: string) {
    value = next === NONE ? "" : next;
    onchange?.(value);
  }
</script>

{#snippet select()}
  <Select.Root type="single" value={value || NONE} onValueChange={set} {disabled}>
    <Select.Trigger class={cn("w-full min-w-0 sm:w-48 pointer-coarse:h-10!", className)} aria-label="Glossary">
      <BookOpenIcon class="text-muted-foreground" />
      <span class="flex-1 truncate text-left">{selected?.name ?? "No glossary"}</span>
    </Select.Trigger>
    <Select.Content>
      <Select.Item value={NONE} label="No glossary">No glossary</Select.Item>
      {#if options.length > 0}
        <Select.Separator />
        {#each options as g (g.glossary_id)}
          <Select.Item value={g.glossary_id} label={g.name}>{g.name}</Select.Item>
        {/each}
      {/if}
    </Select.Content>
  </Select.Root>
{/snippet}

{#if disabledReason}
  <Tooltip.Root>
    <Tooltip.Trigger>
      {#snippet child({ props })}
        <span {...props} class="inline-flex w-full min-w-0 sm:w-auto"
          >{@render select()}<span class="sr-only">{disabledReason}</span></span
        >
      {/snippet}
    </Tooltip.Trigger>
    <Tooltip.Content>{disabledReason}</Tooltip.Content>
  </Tooltip.Root>
{:else}
  {@render select()}
{/if}
