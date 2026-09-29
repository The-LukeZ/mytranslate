<script lang="ts">
  import ArrowRightIcon from "@lucide/svelte/icons/arrow-right";
  import LoaderIcon from "@lucide/svelte/icons/loader-circle";
  import TriangleAlertIcon from "@lucide/svelte/icons/triangle-alert";
  import { toast } from "svelte-sonner";
  import PairLabel from "#lib/components/pair-label.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import * as Dialog from "#lib/components/ui/dialog/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import { Label } from "#lib/components/ui/label/index.js";
  import * as Select from "#lib/components/ui/select/index.js";
  import { MAX_TERM_BYTES, utf8Bytes } from "#lib/glossary/tsv.js";
  import { pairLabel, sameLang } from "#lib/languages.js";
  import type { Glossary } from "#lib/server/deepl/types.js";
  import { reportError } from "#lib/ui-state.svelte.js";
  import { addTerm, createGlossary, getEntries } from "../../routes/glossaries.remote";

  interface Props {
    open: boolean;
    glossaries: Glossary[];
    /** Base code, e.g. `de`. */
    sourceLang: string;
    /** Base code, e.g. `en`. */
    targetLang: string;
    initialSource?: string;
    initialTarget?: string;
  }

  let {
    open = $bindable(),
    glossaries,
    sourceLang,
    targetLang,
    initialSource = "",
    initialTarget = "",
  }: Props = $props();

  const NEW = "__new__";

  let sourceTerm = $state("");
  let targetTerm = $state("");
  let choice = $state(NEW);
  let newName = $state("");
  let saving = $state(false);

  const findDict = (g: Glossary | undefined) =>
    g?.dictionaries.find((d) => sameLang(d.source_lang, sourceLang) && sameLang(d.target_lang, targetLang));

  // Reset the form each time the dialog opens.
  $effect(() => {
    if (!open) return;
    sourceTerm = initialSource;
    targetTerm = initialTarget;
    newName = "";
    saving = false;
    const withPair = glossaries.find((g) => findDict(g));
    choice = withPair?.glossary_id ?? glossaries[0]?.glossary_id ?? NEW;
  });

  const selected = $derived(glossaries.find((g) => g.glossary_id === choice));
  const dictionary = $derived(findDict(selected));

  // Existing entries of the chosen dictionary, to warn before overwriting a term.
  const entriesQuery = $derived(
    open && selected && dictionary
      ? getEntries({ id: selected.glossary_id, sourceLang: dictionary.source_lang, targetLang: dictionary.target_lang })
      : undefined,
  );
  const existing = $derived(entriesQuery?.current?.find((e) => e.source === sourceTerm.trim()));

  function termError(value: string): string | undefined {
    const v = value.trim();
    if (!v) return undefined;
    if (/[\t\r\n]/.test(v)) return "Terms can't contain tabs or line breaks";
    if (utf8Bytes(v) > MAX_TERM_BYTES) return `Longer than ${MAX_TERM_BYTES} bytes`;
  }

  const sourceError = $derived(termError(sourceTerm));
  const targetError = $derived(termError(targetTerm));
  const canSave = $derived(
    !!sourceLang &&
      !!targetLang &&
      !!sourceTerm.trim() &&
      !!targetTerm.trim() &&
      !sourceError &&
      !targetError &&
      (choice !== NEW || !!newName.trim()) &&
      !saving,
  );

  async function save(e: SubmitEvent) {
    e.preventDefault();
    if (!canSave) return;
    saving = true;
    const source = sourceTerm.trim();
    const target = targetTerm.trim();
    try {
      if (choice === NEW) {
        const g = await createGlossary({ name: newName.trim(), sourceLang, targetLang, entries: [{ source, target }] });
        toast.success(`Created “${g.name}”`, { description: `${source} → ${target}` });
      } else {
        const res = await addTerm({ id: choice, sourceLang, targetLang, source, target });
        toast.success(existing ? "Term replaced" : "Term added", {
          description: `${source} → ${target} in “${selected?.name}”${res.created ? ` (new ${pairLabel(sourceLang, targetLang)} pair)` : ""}`,
        });
      }
      open = false;
    } catch (err) {
      reportError(err, "Couldn't save the term");
    } finally {
      saving = false;
    }
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="sm:max-w-lg">
    <Dialog.Header>
      <Dialog.Title>Add to glossary</Dialog.Title>
      <Dialog.Description>
        {#if sourceLang && targetLang}
          Language pair <PairLabel source={sourceLang} target={targetLang} class="font-medium text-foreground" />
        {:else}
          Choose a source language or translate first so the language can be detected.
        {/if}
      </Dialog.Description>
    </Dialog.Header>

    <form class="grid gap-4" onsubmit={save}>
      <div class="grid gap-1.5">
        <Label for="term-glossary">Glossary</Label>
        <Select.Root type="single" bind:value={choice}>
          <Select.Trigger id="term-glossary" class="w-full">
            <span class="truncate">{choice === NEW ? "New glossary…" : (selected?.name ?? "Choose a glossary")}</span>
          </Select.Trigger>
          <Select.Content>
            {#each glossaries as g (g.glossary_id)}
              <Select.Item value={g.glossary_id} label={g.name}>
                <span class="truncate">{g.name}</span>
                {#if findDict(g)}
                  <span class="ml-auto text-xs text-muted-foreground">{findDict(g)?.entry_count} terms</span>
                {/if}
              </Select.Item>
            {/each}
            {#if glossaries.length}<Select.Separator />{/if}
            <Select.Item value={NEW} label="New glossary…">➕ New glossary…</Select.Item>
          </Select.Content>
        </Select.Root>
        {#if choice !== NEW && selected && !dictionary}
          <p class="text-xs text-muted-foreground">
            This glossary has no <PairLabel source={sourceLang} target={targetLang} /> pair yet; it will be added.
          </p>
        {/if}
      </div>

      {#if choice === NEW}
        <div class="grid gap-1.5">
          <Label for="term-new-name">Glossary name</Label>
          <Input id="term-new-name" bind:value={newName} required maxlength={200} autocomplete="off" />
        </div>
      {/if}

      <div class="grid gap-4 sm:grid-cols-2">
        <div class="grid gap-1.5">
          <Label for="term-source">Source term ({sourceLang.toUpperCase() || "?"})</Label>
          <Input
            id="term-source"
            bind:value={sourceTerm}
            required
            autocomplete="off"
            aria-invalid={!!sourceError}
            aria-describedby={sourceError ? "term-source-error" : undefined}
          />
          {#if sourceError}<p id="term-source-error" class="text-xs text-destructive">{sourceError}</p>{/if}
        </div>
        <div class="grid gap-1.5">
          <Label for="term-target">Target term ({targetLang.toUpperCase() || "?"})</Label>
          <Input
            id="term-target"
            bind:value={targetTerm}
            required
            autocomplete="off"
            aria-invalid={!!targetError}
            aria-describedby={targetError ? "term-target-error" : undefined}
          />
          {#if targetError}<p id="term-target-error" class="text-xs text-destructive">{targetError}</p>{/if}
        </div>
      </div>

      {#if existing && existing.target !== targetTerm.trim()}
        <p
          role="status"
          class="flex items-start gap-2 rounded-2xl bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400"
        >
          <TriangleAlertIcon class="mt-0.5 size-4 shrink-0" />
          <span class="inline-flex flex-wrap items-center gap-1">
            Will replace “{existing.source}
            <ArrowRightIcon aria-hidden="true" class="size-[1em] shrink-0" />
            {existing.target}”.
          </span>
        </p>
      {/if}

      <Dialog.Footer>
        <Button variant="outline" type="button" onclick={() => (open = false)}>Cancel</Button>
        <Button type="submit" disabled={!canSave}>
          {#if saving}<LoaderIcon class="motion-safe:animate-spin" />{/if}
          {choice === NEW ? "Create glossary" : "Add term"}
        </Button>
      </Dialog.Footer>
    </form>
  </Dialog.Content>
</Dialog.Root>
