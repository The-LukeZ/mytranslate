<script lang="ts">
  import LanguageCombobox from "#lib/components/language-combobox.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import * as Dialog from "#lib/components/ui/dialog/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import { Label } from "#lib/components/ui/label/index.js";
  import { trimEntries, validateEntries, type GlossaryEntry } from "#lib/glossary/tsv.js";
  import type { Glossary } from "#lib/server/deepl/types.js";
  import { reportError } from "#lib/ui-state.svelte.js";
  import { pairLabel, sameLang, sourceLanguages, targetLanguages } from "#lib/utils/languages.js";
  import ArrowRightIcon from "@lucide/svelte/icons/arrow-right";
  import LoaderIcon from "@lucide/svelte/icons/loader-circle";
  import PlusIcon from "@lucide/svelte/icons/plus";
  import XIcon from "@lucide/svelte/icons/x";
  import { tick } from "svelte";
  import { toast } from "svelte-sonner";
  import { getLanguages } from "../remote/meta.remote.js";
  import { createGlossary } from "../remote/glossaries.remote.js";

  interface Props {
    open: boolean;
    oncreated?: (g: Glossary) => void;
  }

  let { open = $bindable(), oncreated }: Props = $props();

  interface Row {
    id: number;
    source: string;
    target: string;
  }

  const languagesQuery = getLanguages("glossary");
  const languages = $derived(languagesQuery.current ?? []);
  const sources = $derived(sourceLanguages(languages));
  const targets = $derived(targetLanguages(languages));

  let nextId = 0;
  const newRow = (): Row => ({ id: nextId++, source: "", target: "" });

  let name = $state("");
  let sourceLang = $state("");
  let targetLang = $state("");
  let rows = $state<Row[]>([newRow()]);
  let saving = $state(false);
  let grid = $state<HTMLElement | null>(null);

  // Reset the form each time the dialog opens.
  $effect(() => {
    if (!open) return;
    name = "";
    sourceLang = "";
    targetLang = "";
    rows = [newRow()];
    saving = false;
  });

  /** Rows with any content, with their position in the visible list (for messages). */
  const filled = $derived(
    rows.map((r, index) => ({ ...r, index })).filter((r) => r.source.trim() !== "" || r.target.trim() !== ""),
  );
  const entries = $derived<GlossaryEntry[]>(trimEntries(filled));
  const issue = $derived.by(() => {
    const first = validateEntries(entries)[0];
    return first ? `Row ${filled[first.row]!.index + 1}: ${first.message}` : undefined;
  });
  const samePair = $derived(!!sourceLang && !!targetLang && sameLang(sourceLang, targetLang));
  const canSubmit = $derived(
    !!name.trim() && !!sourceLang && !!targetLang && !samePair && entries.length > 0 && !issue && !saving,
  );

  async function addRow() {
    rows.push(newRow());
    await tick();
    // Focus the new row's source field.
    const inputs = grid?.querySelectorAll<HTMLInputElement>("input");
    inputs?.[inputs.length - 2]?.focus();
  }

  function removeRow(id: number) {
    rows = rows.length > 1 ? rows.filter((r) => r.id !== id) : [newRow()];
  }

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    saving = true;
    try {
      const glossary = await createGlossary({ name: name.trim(), sourceLang, targetLang, entries });
      toast.success(`Created “${glossary.name}”`, { description: pairLabel(sourceLang, targetLang) });
      open = false;
      oncreated?.(glossary);
    } catch (err) {
      reportError(err, "Couldn't create the glossary");
    } finally {
      saving = false;
    }
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
    <Dialog.Header>
      <Dialog.Title>New glossary</Dialog.Title>
      <Dialog.Description>
        Start with one language pair and at least one term. You can add more pairs and terms later.
      </Dialog.Description>
    </Dialog.Header>

    <form class="grid gap-4" onsubmit={submit}>
      {#if languagesQuery.error}
        <div
          role="alert"
          class="flex items-center gap-3 rounded-2xl border border-destructive/30 bg-destructive/10 p-3 text-sm"
        >
          <span class="flex-1">Couldn't load languages: {languagesQuery.error.message}</span>
          <Button size="sm" variant="outline" type="button" onclick={() => languagesQuery.refresh()}>Retry</Button>
        </div>
      {/if}

      <div class="grid gap-1.5">
        <Label for="new-glossary-name">Name</Label>
        <Input id="new-glossary-name" bind:value={name} required maxlength={200} autocomplete="off" />
      </div>

      <div class="grid gap-1.5">
        <span class="text-sm leading-none font-medium select-none">Language pair</span>
        <div class="flex flex-wrap items-center gap-2">
          <LanguageCombobox
            label="Source language"
            languages={sources}
            bind:value={sourceLang}
            placeholder="Source language"
            disabled={languagesQuery.loading && !languagesQuery.current}
          />
          <ArrowRightIcon aria-hidden="true" class="size-4 shrink-0 text-muted-foreground" />
          <LanguageCombobox
            label="Target language"
            languages={targets}
            bind:value={targetLang}
            placeholder="Target language"
            disabled={languagesQuery.loading && !languagesQuery.current}
          />
        </div>
        {#if samePair}
          <p class="text-xs text-destructive">Source and target language must be different.</p>
        {/if}
      </div>

      <fieldset class="grid gap-2">
        <legend class="mb-1 text-sm leading-none font-medium">Terms</legend>
        <div
          bind:this={grid}
          class="grid grid-cols-[1fr_1fr_auto] items-center gap-2"
          role="group"
          aria-label="Glossary terms"
        >
          <span class="text-xs text-muted-foreground">Source{sourceLang ? ` (${sourceLang.toUpperCase()})` : ""}</span>
          <span class="text-xs text-muted-foreground">Target{targetLang ? ` (${targetLang.toUpperCase()})` : ""}</span>
          <span class="size-8" aria-hidden="true"></span>
          {#each rows as row, i (row.id)}
            <Input bind:value={row.source} aria-label={`Source term, row ${i + 1}`} autocomplete="off" />
            <Input bind:value={row.target} aria-label={`Target term, row ${i + 1}`} autocomplete="off" />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Remove row ${i + 1}`}
              onclick={() => removeRow(row.id)}
            >
              <XIcon />
            </Button>
          {/each}
        </div>
        <div class="flex items-center gap-3">
          <Button type="button" variant="outline" size="sm" onclick={addRow}>
            <PlusIcon />
            Add row
          </Button>
          {#if issue}
            <p role="alert" class="text-xs text-destructive">{issue}</p>
          {:else if entries.length === 0}
            <p class="text-xs text-muted-foreground">Add at least one term.</p>
          {/if}
        </div>
      </fieldset>

      <Dialog.Footer>
        <Button variant="outline" type="button" onclick={() => (open = false)}>Cancel</Button>
        <Button type="submit" disabled={!canSubmit}>
          {#if saving}<LoaderIcon class="motion-safe:animate-spin" />{/if}
          Create glossary
        </Button>
      </Dialog.Footer>
    </form>
  </Dialog.Content>
</Dialog.Root>
