<script lang="ts">
  import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
  import CheckIcon from "@lucide/svelte/icons/check";
  import LoaderIcon from "@lucide/svelte/icons/loader-circle";
  import PencilIcon from "@lucide/svelte/icons/pencil";
  import PlusIcon from "@lucide/svelte/icons/plus";
  import Trash2Icon from "@lucide/svelte/icons/trash-2";
  import XIcon from "@lucide/svelte/icons/x";
  import { toast } from "svelte-sonner";
  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import { page } from "$app/state";
  import ConfirmDialog from "#lib/components/confirm-dialog.svelte";
  import GlossaryTableEditor from "#lib/components/glossary-table-editor.svelte";
  import LanguageCombobox from "#lib/components/language-combobox.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import * as Dialog from "#lib/components/ui/dialog/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import { Label } from "#lib/components/ui/label/index.js";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  import * as Tabs from "#lib/components/ui/tabs/index.js";
  import { MAX_TERM_BYTES, utf8Bytes } from "#lib/glossary/tsv.js";
  import { pairLabel, sameLang, sourceLanguages, targetLanguages } from "#lib/languages.js";
  import type { GlossaryDictionaryInfo } from "#lib/server/deepl/types.js";
  import { errorStatus, reportError } from "#lib/ui-state.svelte.js";
  import {
    deleteDictionary,
    deleteGlossary,
    getEntries,
    getGlossary,
    listGlossaries,
    renameGlossary,
    saveDictionary,
  } from "../../glossaries.remote";
  import { getLanguages } from "../../meta.remote";

  const id = $derived(page.params.id!);
  const glossaryQuery = $derived(getGlossary(id));
  const glossary = $derived(glossaryQuery.current);
  const notFound = $derived(errorStatus(glossaryQuery.error) === 404);

  const glossaryLanguages = getLanguages("glossary");

  const pairKey = (d: GlossaryDictionaryInfo) => `${d.source_lang}-${d.target_lang}`;

  // ── Tabs ───────────────────────────────────────────────────────────────────
  let activeKey = $state("");
  let editorDirty = $state(false);
  const dictionaries = $derived(glossary?.dictionaries ?? []);
  const active = $derived(dictionaries.find((d) => pairKey(d) === activeKey) ?? dictionaries[0]);
  const entriesQuery = $derived(
    active ? getEntries({ id, sourceLang: active.source_lang, targetLang: active.target_lang }) : undefined,
  );

  function selectTab(key: string) {
    if (key === activeKey) return;
    if (editorDirty && !confirm("You have unsaved changes in this language pair. Discard them?")) return;
    editorDirty = false;
    activeKey = key;
  }

  // ── Rename ─────────────────────────────────────────────────────────────────
  let editingName = $state(false);
  let nameDraft = $state("");
  let renaming = $state(false);
  let nameInput = $state<HTMLInputElement | null>(null);

  function startRename() {
    if (!glossary) return;
    nameDraft = glossary.name;
    editingName = true;
    queueMicrotask(() => nameInput?.select());
  }

  async function submitRename(e: SubmitEvent) {
    e.preventDefault();
    const name = nameDraft.trim();
    if (!name || name === glossary?.name) {
      editingName = false;
      return;
    }
    renaming = true;
    try {
      await renameGlossary({ id, name });
      editingName = false;
      toast.success("Glossary renamed");
    } catch (err) {
      reportError(err, "Couldn't rename the glossary");
    } finally {
      renaming = false;
    }
  }

  // ── Delete glossary / pair ─────────────────────────────────────────────────
  let confirmDeleteGlossary = $state(false);
  let confirmDeletePair = $state(false);
  const onlyPair = $derived(dictionaries.length <= 1);

  async function removeGlossary() {
    try {
      await deleteGlossary(id);
      editorDirty = false;
      toast.success(`Deleted “${glossary?.name}”`);
      await goto(resolve("/glossaries"));
    } catch (err) {
      reportError(err, "Couldn't delete the glossary");
      throw err;
    }
  }

  async function removePair() {
    if (!active) return;
    if (onlyPair) return removeGlossary();
    try {
      await deleteDictionary({ id, sourceLang: active.source_lang, targetLang: active.target_lang });
      editorDirty = false;
      toast.success(`Deleted ${pairLabel(active.source_lang, active.target_lang)}`);
      activeKey = "";
    } catch (err) {
      reportError(err, "Couldn't delete the language pair");
      throw err;
    }
  }

  // ── Add language pair ──────────────────────────────────────────────────────
  let addPairOpen = $state(false);
  let newSource = $state("");
  let newTarget = $state("");
  let newTermSource = $state("");
  let newTermTarget = $state("");
  let addingPair = $state(false);

  const pairExists = $derived(
    dictionaries.some((d) => sameLang(d.source_lang, newSource) && sameLang(d.target_lang, newTarget)),
  );
  const termTooLong = $derived(
    utf8Bytes(newTermSource.trim()) > MAX_TERM_BYTES || utf8Bytes(newTermTarget.trim()) > MAX_TERM_BYTES,
  );
  const canAddPair = $derived(
    !!newSource &&
      !!newTarget &&
      !sameLang(newSource, newTarget) &&
      !pairExists &&
      !!newTermSource.trim() &&
      !!newTermTarget.trim() &&
      !termTooLong &&
      !addingPair,
  );

  function openAddPair() {
    newSource = active?.source_lang ?? "";
    newTarget = "";
    newTermSource = "";
    newTermTarget = "";
    addPairOpen = true;
  }

  async function submitAddPair(e: SubmitEvent) {
    e.preventDefault();
    if (!canAddPair) return;
    if (editorDirty && !confirm("You have unsaved changes in this language pair. Discard them?")) return;
    addingPair = true;
    try {
      const info = await saveDictionary({
        id,
        sourceLang: newSource,
        targetLang: newTarget,
        entries: [{ source: newTermSource.trim(), target: newTermTarget.trim() }],
      });
      editorDirty = false;
      activeKey = pairKey(info);
      addPairOpen = false;
      toast.success(`Added ${pairLabel(info.source_lang, info.target_lang)}`);
    } catch (err) {
      reportError(err, "Couldn't add the language pair");
    } finally {
      addingPair = false;
    }
  }

  // A glossary that disappeared (deleted elsewhere): tell the user and refresh the list.
  $effect(() => {
    if (notFound) {
      toast.error("This glossary no longer exists.");
      void listGlossaries().refresh();
    }
  });
</script>

<svelte:head><title>{glossary ? `${glossary.name} · ` : ""}Glossaries · mytranslate</title></svelte:head>

<div class="mb-4">
  <Button variant="ghost" size="sm" href={resolve("/glossaries")}>
    <ArrowLeftIcon />
    All glossaries
  </Button>
</div>

{#if glossaryQuery.error}
  <div role="alert" class="flex flex-col items-start gap-3 rounded-3xl border p-6">
    {#if notFound}
      <h1 class="text-lg font-semibold">Glossary not found</h1>
      <p class="text-sm text-muted-foreground">It may have been deleted.</p>
      <Button href={resolve("/glossaries")}>Back to glossaries</Button>
    {:else}
      <h1 class="text-lg font-semibold">Couldn't load the glossary</h1>
      <p class="text-sm text-muted-foreground">{glossaryQuery.error.message}</p>
      <Button variant="outline" onclick={() => glossaryQuery.refresh()}>Retry</Button>
    {/if}
  </div>
{:else if !glossary}
  <div class="flex flex-col gap-4" aria-busy="true" aria-label="Loading glossary">
    <Skeleton class="h-8 w-64" />
    <Skeleton class="h-4 w-40" />
    <Skeleton class="h-9 w-80" />
    <Skeleton class="h-64 w-full" />
  </div>
{:else}
  <!-- Header -->
  <div class="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start">
    <div class="min-w-0 flex-1">
      {#if editingName}
        <form class="flex items-center gap-2" onsubmit={submitRename}>
          <Input
            bind:ref={nameInput}
            bind:value={nameDraft}
            aria-label="Glossary name"
            class="h-9 max-w-md text-lg font-semibold"
            onkeydown={(e) => e.key === "Escape" && (editingName = false)}
            required
          />
          <Button type="submit" size="icon" aria-label="Save name" disabled={renaming}>
            {#if renaming}<LoaderIcon class="motion-safe:animate-spin" />{:else}<CheckIcon />{/if}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Cancel rename"
            onclick={() => (editingName = false)}
          >
            <XIcon />
          </Button>
        </form>
      {:else}
        <div class="flex items-center gap-1">
          <h1 class="truncate text-2xl font-semibold tracking-tight">{glossary.name}</h1>
          <Button variant="ghost" size="icon-sm" aria-label="Rename glossary" onclick={startRename}>
            <PencilIcon />
          </Button>
        </div>
      {/if}
      <p class="mt-1 text-sm text-muted-foreground">
        Created {new Date(glossary.creation_time).toLocaleString()} ·
        {dictionaries.length}
        {dictionaries.length === 1 ? "language pair" : "language pairs"}
      </p>
    </div>
    <Button variant="destructive" onclick={() => (confirmDeleteGlossary = true)}>
      <Trash2Icon />
      Delete glossary
    </Button>
  </div>

  <!-- Language pairs -->
  <Tabs.Root value={active ? pairKey(active) : ""} onValueChange={selectTab}>
    <div class="mb-4 flex flex-wrap items-center gap-2">
      <Tabs.List aria-label="Language pairs" class="flex-wrap">
        {#each dictionaries as d (pairKey(d))}
          <Tabs.Trigger value={pairKey(d)}>
            {pairLabel(d.source_lang, d.target_lang)}
            <span class="text-xs text-muted-foreground tabular-nums">{d.entry_count}</span>
          </Tabs.Trigger>
        {/each}
      </Tabs.List>
      <Button variant="outline" size="sm" onclick={openAddPair}>
        <PlusIcon />
        Language pair
      </Button>
      {#if active}
        <Button
          variant="ghost"
          size="sm"
          class="text-destructive sm:ml-auto"
          onclick={() => (confirmDeletePair = true)}
        >
          <Trash2Icon />
          Delete {pairLabel(active.source_lang, active.target_lang)}
        </Button>
      {/if}
    </div>

    {#if active}
      <Tabs.Content value={pairKey(active)}>
        {#if entriesQuery?.error}
          <div
            role="alert"
            class="flex items-center gap-3 rounded-2xl border border-destructive/30 bg-destructive/10 p-3 text-sm"
          >
            <span class="flex-1">Couldn't load entries: {entriesQuery.error.message}</span>
            <Button size="sm" variant="outline" onclick={() => entriesQuery?.refresh()}>Retry</Button>
          </div>
        {:else if entriesQuery?.current}
          {#key pairKey(active)}
            <GlossaryTableEditor
              glossaryId={id}
              sourceLang={active.source_lang}
              targetLang={active.target_lang}
              entries={entriesQuery.current}
              bind:dirty={editorDirty}
            />
          {/key}
        {:else}
          <div class="flex flex-col gap-2" aria-busy="true" aria-label="Loading entries">
            {#each { length: 6 }, i (i)}<Skeleton class="h-9 w-full" />{/each}
          </div>
        {/if}
      </Tabs.Content>
    {:else}
      <p class="rounded-3xl border p-8 text-center text-muted-foreground">
        This glossary has no language pairs. Add one to start adding terms.
      </p>
    {/if}
  </Tabs.Root>
{/if}

<ConfirmDialog
  bind:open={confirmDeleteGlossary}
  title={`Delete “${glossary?.name ?? ""}”?`}
  description={`This deletes the glossary and all ${dictionaries.length} of its language pairs. This can't be undone.`}
  confirmLabel="Delete glossary"
  onconfirm={removeGlossary}
/>

<ConfirmDialog
  bind:open={confirmDeletePair}
  title={onlyPair
    ? "Delete the whole glossary?"
    : `Delete ${active ? pairLabel(active.source_lang, active.target_lang) : "this pair"}?`}
  description={onlyPair
    ? "This is the glossary's only language pair, and a glossary needs at least one. Delete the whole glossary instead? This can't be undone."
    : `All ${active?.entry_count ?? 0} entries of this language pair will be deleted. This can't be undone.`}
  confirmLabel={onlyPair ? "Delete glossary" : "Delete language pair"}
  onconfirm={removePair}
/>

<Dialog.Root bind:open={addPairOpen}>
  <Dialog.Content class="sm:max-w-lg">
    <Dialog.Header>
      <Dialog.Title>Add a language pair</Dialog.Title>
      <Dialog.Description>DeepL needs at least one entry to create the pair.</Dialog.Description>
    </Dialog.Header>
    <form class="grid gap-4" onsubmit={submitAddPair}>
      <div class="grid gap-4 sm:grid-cols-2">
        <div class="grid gap-1.5">
          <Label>Source language</Label>
          <LanguageCombobox
            label="Source language"
            languages={sourceLanguages(glossaryLanguages.current ?? [])}
            bind:value={newSource}
            class="sm:w-full"
          />
        </div>
        <div class="grid gap-1.5">
          <Label>Target language</Label>
          <LanguageCombobox
            label="Target language"
            languages={targetLanguages(glossaryLanguages.current ?? [])}
            bind:value={newTarget}
            class="sm:w-full"
          />
        </div>
      </div>
      {#if pairExists}
        <p class="text-sm text-destructive">This glossary already has {pairLabel(newSource, newTarget)}.</p>
      {:else if newSource && newTarget && sameLang(newSource, newTarget)}
        <p class="text-sm text-destructive">Source and target must differ.</p>
      {/if}
      <div class="grid gap-4 sm:grid-cols-2">
        <div class="grid gap-1.5">
          <Label for="pair-term-source">First source term</Label>
          <Input id="pair-term-source" bind:value={newTermSource} autocomplete="off" required />
        </div>
        <div class="grid gap-1.5">
          <Label for="pair-term-target">First target term</Label>
          <Input id="pair-term-target" bind:value={newTermTarget} autocomplete="off" required />
        </div>
      </div>
      {#if termTooLong}<p class="text-sm text-destructive">Terms can be at most {MAX_TERM_BYTES} bytes.</p>{/if}
      <Dialog.Footer>
        <Button type="button" variant="outline" onclick={() => (addPairOpen = false)}>Cancel</Button>
        <Button type="submit" disabled={!canAddPair}>
          {#if addingPair}<LoaderIcon class="motion-safe:animate-spin" />{/if}
          Add pair
        </Button>
      </Dialog.Footer>
    </form>
  </Dialog.Content>
</Dialog.Root>
