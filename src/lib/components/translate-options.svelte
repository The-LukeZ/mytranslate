<script lang="ts">
  import { MediaQuery } from "svelte/reactivity";
  import { Button } from "#lib/components/ui/button/index.js";
  import * as Dialog from "#lib/components/ui/dialog/index.js";
  import * as Drawer from "#lib/components/ui/drawer/index.js";
  import { Label } from "#lib/components/ui/label/index.js";
  import { Textarea } from "#lib/components/ui/textarea/index.js";
  import * as ToggleGroup from "#lib/components/ui/toggle-group/index.js";
  import { MAX_CONTEXT_CHARS } from "#lib/config.js";
  import { DEFAULT_FORMALITY, DEFAULT_MODEL, prefs, type FormalityPref, type ModelPref } from "#lib/prefs.svelte.js";

  interface Props {
    open: boolean;
    /** Context text for the next translation; lives on the page, never persisted. */
    context: string;
    /** Why formality can't be used for the current target, if it can't. */
    formalityUnavailable?: string;
  }

  let { open = $bindable(false), context = $bindable(""), formalityUnavailable }: Props = $props();

  // A centred dialog on wide screens, a bottom sheet on phones (shadcn-svelte's responsive dialog pattern).
  const isDesktop = new MediaQuery("(min-width: 768px)");

  const formalityOptions: { value: FormalityPref; label: string; hint: string }[] = [
    { value: "default", label: "Default", hint: "DeepL picks the tone." },
    { value: "prefer_more", label: "More formal", hint: "Polite forms of address, like German “Sie”." },
    { value: "prefer_less", label: "Less formal", hint: "Familiar forms of address, like German “du”." },
  ];
  const modelOptions: { value: ModelPref; label: string; hint: string }[] = [
    {
      value: "prefer_quality_optimized",
      label: "Quality",
      hint: "Best model where available, otherwise the faster one.",
    },
    { value: "latency_optimized", label: "Faster", hint: "Quicker responses, slightly lower quality." },
    { value: "quality_optimized", label: "Quality only", hint: "Fails for language pairs without the quality model." },
  ];

  // One line under each group that changes its words but never its height.
  const formalityHint = $derived(
    formalityUnavailable ?? formalityOptions.find((o) => o.value === prefs.formality)?.hint,
  );
  const modelHint = $derived(modelOptions.find((o) => o.value === prefs.modelType)?.hint);

  const isDefault = $derived(
    prefs.formality === DEFAULT_FORMALITY && prefs.modelType === DEFAULT_MODEL && !context.trim(),
  );

  function reset() {
    prefs.formality = DEFAULT_FORMALITY;
    prefs.modelType = DEFAULT_MODEL;
    context = "";
  }

  const segment =
    "flex-1 rounded-xl px-2 text-muted-foreground data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm pointer-coarse:h-10 dark:data-[state=on]:bg-input";
</script>

{#snippet fields()}
  <div class="flex flex-col gap-5">
    <div class="flex flex-col gap-2">
      <Label id="formality-label">Formality</Label>
      <ToggleGroup.Root
        type="single"
        spacing={1}
        aria-labelledby="formality-label"
        aria-describedby="formality-hint"
        class="w-full rounded-2xl bg-input/50 p-1"
        disabled={!!formalityUnavailable}
        bind:value={() => prefs.formality, (v) => v && (prefs.formality = v as FormalityPref)}
      >
        {#each formalityOptions as o (o.value)}
          <ToggleGroup.Item value={o.value} class={segment}>{o.label}</ToggleGroup.Item>
        {/each}
      </ToggleGroup.Root>
      <p id="formality-hint" class="truncate text-xs text-muted-foreground" title={formalityHint}>{formalityHint}</p>
    </div>

    <div class="flex flex-col gap-2">
      <Label id="model-label">Model</Label>
      <ToggleGroup.Root
        type="single"
        spacing={1}
        aria-labelledby="model-label"
        aria-describedby="model-hint"
        class="w-full rounded-2xl bg-input/50 p-1"
        bind:value={() => prefs.modelType, (v) => v && (prefs.modelType = v as ModelPref)}
      >
        {#each modelOptions as o (o.value)}
          <ToggleGroup.Item value={o.value} class={segment}>{o.label}</ToggleGroup.Item>
        {/each}
      </ToggleGroup.Root>
      <p id="model-hint" class="truncate text-xs text-muted-foreground" title={modelHint}>{modelHint}</p>
    </div>

    <div class="flex flex-col gap-2">
      <Label for="context">Context</Label>
      <Textarea
        id="context"
        bind:value={context}
        maxlength={MAX_CONTEXT_CHARS}
        rows={3}
        class="max-h-40"
        placeholder="Describe the text, audience or tone…"
        aria-describedby="context-hint"
      />
      <p id="context-hint" class="text-xs text-muted-foreground">
        Not translated, not billed. Kept until you reload the page.
      </p>
    </div>
  </div>
{/snippet}

{#if isDesktop.current}
  <Dialog.Root bind:open>
    <Dialog.Content class="sm:max-w-md">
      <Dialog.Header>
        <Dialog.Title>Translation options</Dialog.Title>
        <Dialog.Description>Used for every translation until you change them.</Dialog.Description>
      </Dialog.Header>
      {@render fields()}
      <Dialog.Footer>
        <Button variant="ghost" class="sm:mr-auto" disabled={isDefault} onclick={reset}>Reset</Button>
        <Dialog.Close>
          {#snippet child({ props })}<Button {...props}>Done</Button>{/snippet}
        </Dialog.Close>
      </Dialog.Footer>
    </Dialog.Content>
  </Dialog.Root>
{:else}
  <Drawer.Root bind:open shouldScaleBackground={false}>
    <!-- No autofocus: focusing the context field would pop up the on-screen keyboard. -->
    <Drawer.Content class="pb-[max(1rem,env(safe-area-inset-bottom))]" onOpenAutoFocus={(e) => e.preventDefault()}>
      <Drawer.Header class="pb-2 text-left">
        <Drawer.Title>Translation options</Drawer.Title>
        <Drawer.Description>Used for every translation until you change them.</Drawer.Description>
      </Drawer.Header>
      <div class="overflow-y-auto px-4 pt-3 pb-2">{@render fields()}</div>
      <Drawer.Footer class="grid grid-cols-2 gap-2">
        <Button variant="outline" class="h-11" disabled={isDefault} onclick={reset}>Reset</Button>
        <Drawer.Close>
          {#snippet child({ props })}<Button {...props} class="h-11">Done</Button>{/snippet}
        </Drawer.Close>
      </Drawer.Footer>
    </Drawer.Content>
  </Drawer.Root>
{/if}
