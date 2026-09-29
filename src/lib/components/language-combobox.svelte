<script lang="ts">
  import ChevronsUpDownIcon from "@lucide/svelte/icons/chevrons-up-down";
  import SparklesIcon from "@lucide/svelte/icons/sparkles";
  import { MediaQuery } from "svelte/reactivity";
  import { Button } from "#lib/components/ui/button/index.js";
  import * as Command from "#lib/components/ui/command/index.js";
  import * as Drawer from "#lib/components/ui/drawer/index.js";
  import * as Popover from "#lib/components/ui/popover/index.js";
  import * as ScrollArea from "#lib/components/ui/scroll-area/index.js";
  import { langLabel, sameLang, type Language } from "#lib/utils/languages.js";
  import { cn } from "#lib/utils.js";

  interface Props {
    languages: Language[];
    /** Language code; empty string means auto-detect (only with `allowAuto`). */
    value: string;
    allowAuto?: boolean;
    /** Shown next to "Auto-detect" once a language was detected. */
    detected?: string;
    placeholder?: string;
    label: string;
    disabled?: boolean;
    class?: string;
    onchange?: (value: string) => void;
  }

  let {
    languages,
    value = $bindable(),
    allowAuto = false,
    detected,
    placeholder = "Choose language",
    label,
    disabled = false,
    class: className,
    onchange,
  }: Props = $props();

  let open = $state(false);
  let triggerRef = $state<HTMLButtonElement | null>(null);

  // A popover on wide screens, a bottom sheet on phones (shadcn-svelte's responsive dialog pattern).
  const isDesktop = new MediaQuery("(min-width: 768px)");

  const AUTO = "__auto__";

  const display = $derived.by(() => {
    if (!value) {
      if (!allowAuto) return placeholder;
      return detected ? `Auto-detect (${langLabel(languages, detected)})` : "Auto-detect";
    }
    return langLabel(languages, value);
  });

  function select(code: string) {
    value = code === AUTO ? "" : code;
    onchange?.(value);
    open = false;
    // Return focus to the trigger so keyboard users keep their place.
    queueMicrotask(() => triggerRef?.focus());
  }
</script>

{#snippet trigger(props: Record<string, unknown>)}
  <Button
    {...props}
    variant="outline"
    role="combobox"
    aria-expanded={open}
    aria-label={`${label}: ${display}`}
    class={cn("w-full min-w-0 justify-between font-normal sm:w-52 pointer-coarse:h-10", className)}
  >
    <span class="truncate">{display}</span>
    <ChevronsUpDownIcon class="opacity-50" />
  </Button>
{/snippet}

{#snippet items(touch: boolean)}
  <Command.Empty>No language found.</Command.Empty>
  <Command.Group>
    {#if allowAuto}
      <Command.Item
        value={AUTO}
        keywords={["auto", "detect"]}
        data-checked={!value}
        class={touch ? "min-h-11 text-base" : undefined}
        onSelect={() => select(AUTO)}
      >
        <SparklesIcon class="opacity-60" />
        Auto-detect
      </Command.Item>
    {/if}
    {#each languages as lang (lang.lang)}
      <Command.Item
        value={lang.lang}
        keywords={[lang.name, lang.lang]}
        data-checked={sameLang(lang.lang, value)}
        class={touch ? "min-h-11 text-base" : undefined}
        onSelect={() => select(lang.lang)}
      >
        <div class="flex min-w-0 items-center gap-2">
          <span class="w-14 shrink-0 text-xs whitespace-nowrap text-muted-foreground uppercase">{lang.lang}</span>
          <span class="truncate">{lang.name}</span>
        </div>
      </Command.Item>
    {/each}
  </Command.Group>
{/snippet}

{#snippet list(touch: boolean)}
  <Command.Input
    placeholder="Search language…"
    aria-label={`Search ${label.toLowerCase()}`}
    class={touch ? "text-base" : undefined}
    groupClass={touch ? "h-11!" : undefined}
  />
  {#if touch}
    <Command.List class="max-h-none min-h-0 flex-1 overscroll-contain">
      {@render items(true)}
    </Command.List>
  {:else}
    <ScrollArea.Root class="**:data-[slot=scroll-area-viewport]:max-h-72">
      <Command.List class="max-h-none overflow-visible">
        {@render items(false)}
      </Command.List>
    </ScrollArea.Root>
  {/if}
{/snippet}

{#if isDesktop.current}
  <Popover.Root bind:open>
    <Popover.Trigger bind:ref={triggerRef} {disabled}>
      {#snippet child({ props })}{@render trigger(props)}{/snippet}
    </Popover.Trigger>
    <Popover.Content class="w-64 p-0" align="start">
      <Command.Root>{@render list(false)}</Command.Root>
    </Popover.Content>
  </Popover.Root>
{:else}
  <Drawer.Root bind:open shouldScaleBackground={false}>
    <Drawer.Trigger bind:ref={triggerRef} {disabled}>
      {#snippet child({ props })}{@render trigger(props)}{/snippet}
    </Drawer.Trigger>
    <!-- Don't focus the search field on open: that would pop up the on-screen keyboard over the list. -->
    <Drawer.Content
      class="h-[80dvh] pb-[max(1rem,env(safe-area-inset-bottom))]"
      onOpenAutoFocus={(e) => e.preventDefault()}
    >
      <Drawer.Header class="pb-2">
        <Drawer.Title>{label}</Drawer.Title>
      </Drawer.Header>
      <Command.Root class="min-h-0 flex-1 bg-transparent">{@render list(true)}</Command.Root>
    </Drawer.Content>
  </Drawer.Root>
{/if}
