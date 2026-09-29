<script lang="ts">
  import BookOpenIcon from "@lucide/svelte/icons/book-open";
  import LoaderIcon from "@lucide/svelte/icons/loader-circle";
  import MoreHorizontalIcon from "@lucide/svelte/icons/more-horizontal";
  import PencilIcon from "@lucide/svelte/icons/pencil";
  import PlusIcon from "@lucide/svelte/icons/plus";
  import TrashIcon from "@lucide/svelte/icons/trash-2";
  import { goto } from "$app/navigation";
  import { resolve } from "$app/paths";
  import { toast } from "svelte-sonner";
  import ConfirmDialog from "#lib/components/confirm-dialog.svelte";
  import CreateGlossaryDialog from "#lib/components/create-glossary-dialog.svelte";
  import { Badge } from "#lib/components/ui/badge/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import * as Dialog from "#lib/components/ui/dialog/index.js";
  import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import { Label } from "#lib/components/ui/label/index.js";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  import * as Table from "#lib/components/ui/table/index.js";
  import { pairLabel } from "#lib/languages.js";
  import type { Glossary } from "#lib/server/deepl/types.js";
  import { reportError } from "#lib/ui-state.svelte.js";
  import { deleteGlossary, listGlossaries, renameGlossary } from "../glossaries.remote";

  const list = listGlossaries();
  const glossaries = $derived(list.current);

  let createOpen = $state(false);

  let renameOpen = $state(false);
  let renameTarget = $state<Glossary | null>(null);
  let renameValue = $state("");
  let renaming = $state(false);

  let deleteOpen = $state(false);
  let deleteTarget = $state<Glossary | null>(null);

  const canRename = $derived(
    !!renameTarget && !!renameValue.trim() && renameValue.trim() !== renameTarget.name && !renaming,
  );

  function openRename(g: Glossary) {
    renameTarget = g;
    renameValue = g.name;
    renaming = false;
    renameOpen = true;
  }

  async function submitRename(e: SubmitEvent) {
    e.preventDefault();
    if (!renameTarget || !canRename) return;
    renaming = true;
    try {
      await renameGlossary({ id: renameTarget.glossary_id, name: renameValue.trim() });
      toast.success("Glossary renamed");
      renameOpen = false;
    } catch (err) {
      reportError(err, "Couldn't rename the glossary");
    } finally {
      renaming = false;
    }
  }

  function openDelete(g: Glossary) {
    deleteTarget = g;
    deleteOpen = true;
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const { glossary_id, name } = deleteTarget;
    try {
      await deleteGlossary(glossary_id);
      toast.success(`Deleted “${name}”`);
    } catch (err) {
      reportError(err, "Couldn't delete the glossary");
      throw err;
    }
  }

  const pairs = (n: number) => `${n} language pair${n === 1 ? "" : "s"}`;
  const nf = new Intl.NumberFormat("en");
</script>

<svelte:head><title>Glossaries · mytranslate</title></svelte:head>

<div class="mb-4 flex items-center gap-3">
  <h1 class="text-xl font-semibold">Glossaries</h1>
  {#if glossaries}
    <span class="text-sm text-muted-foreground tabular-nums">{glossaries.length}</span>
  {/if}
  <Button class="ml-auto" onclick={() => (createOpen = true)}>
    <PlusIcon />
    New glossary
  </Button>
</div>

{#if list.error}
  <div
    role="alert"
    class="mb-4 flex items-center gap-3 rounded-2xl border border-destructive/30 bg-destructive/10 p-3 text-sm"
  >
    <span class="flex-1">Couldn't load glossaries: {list.error.message}</span>
    <Button size="sm" variant="outline" onclick={() => list.refresh()}>Retry</Button>
  </div>
{/if}

{#if glossaries && glossaries.length === 0}
  <div class="flex flex-col items-center gap-3 rounded-3xl border border-dashed px-6 py-16 text-center">
    <div class="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
      <BookOpenIcon class="size-6" />
    </div>
    <h2 class="text-lg font-medium">No glossaries yet</h2>
    <p class="max-w-sm text-sm text-muted-foreground">
      Glossaries make DeepL translate your names, product terms and jargon the way you want, every time.
    </p>
    <Button onclick={() => (createOpen = true)}>
      <PlusIcon />
      Create your first glossary
    </Button>
  </div>
{:else if glossaries || (!list.error && list.loading)}
  <div class="rounded-3xl border">
    <Table.Root>
      <Table.Header>
        <Table.Row>
          <Table.Head>Name</Table.Head>
          <Table.Head>Language pairs</Table.Head>
          <Table.Head class="hidden sm:table-cell">Created</Table.Head>
          <Table.Head class="w-12"><span class="sr-only">Actions</span></Table.Head>
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {#if glossaries}
          {#each glossaries as g (g.glossary_id)}
            <Table.Row>
              <Table.Cell class="max-w-56 font-medium sm:max-w-none">
                <a
                  href={resolve("/glossaries/[id]", { id: g.glossary_id })}
                  class="block truncate underline-offset-4 hover:underline focus-visible:underline"
                >
                  {g.name}
                </a>
              </Table.Cell>
              <Table.Cell>
                <div class="flex flex-wrap gap-1">
                  {#each g.dictionaries as d (`${d.source_lang}-${d.target_lang}`)}
                    <Badge variant="secondary" class="tabular-nums">
                      {pairLabel(d.source_lang, d.target_lang).replace(" → ", "→")} · {nf.format(d.entry_count)}
                    </Badge>
                  {:else}
                    <span class="text-sm text-muted-foreground">No pairs</span>
                  {/each}
                </div>
              </Table.Cell>
              <Table.Cell class="hidden text-muted-foreground sm:table-cell">
                {new Date(g.creation_time).toLocaleDateString()}
              </Table.Cell>
              <Table.Cell class="text-right">
                <DropdownMenu.Root>
                  <DropdownMenu.Trigger>
                    {#snippet child({ props })}
                      <Button {...props} variant="ghost" size="icon" aria-label={`Actions for ${g.name}`}>
                        <MoreHorizontalIcon />
                      </Button>
                    {/snippet}
                  </DropdownMenu.Trigger>
                  <DropdownMenu.Content align="end">
                    <DropdownMenu.Item onSelect={() => goto(resolve("/glossaries/[id]", { id: g.glossary_id }))}>
                      <BookOpenIcon />
                      Open
                    </DropdownMenu.Item>
                    <DropdownMenu.Item onSelect={() => openRename(g)}>
                      <PencilIcon />
                      Rename
                    </DropdownMenu.Item>
                    <DropdownMenu.Separator />
                    <DropdownMenu.Item variant="destructive" onSelect={() => openDelete(g)}>
                      <TrashIcon />
                      Delete
                    </DropdownMenu.Item>
                  </DropdownMenu.Content>
                </DropdownMenu.Root>
              </Table.Cell>
            </Table.Row>
          {/each}
        {:else}
          {#each [0, 1, 2] as i (i)}
            <Table.Row aria-hidden="true">
              <Table.Cell><Skeleton class="h-4 w-32" /></Table.Cell>
              <Table.Cell><Skeleton class="h-5 w-24" /></Table.Cell>
              <Table.Cell class="hidden sm:table-cell"><Skeleton class="h-4 w-20" /></Table.Cell>
              <Table.Cell><Skeleton class="ml-auto size-8" /></Table.Cell>
            </Table.Row>
          {/each}
        {/if}
      </Table.Body>
    </Table.Root>
  </div>
{/if}

<CreateGlossaryDialog
  bind:open={createOpen}
  oncreated={(g) => goto(resolve("/glossaries/[id]", { id: g.glossary_id }))}
/>

<Dialog.Root bind:open={renameOpen}>
  <Dialog.Content class="sm:max-w-sm">
    <Dialog.Header>
      <Dialog.Title>Rename glossary</Dialog.Title>
    </Dialog.Header>
    <form class="grid gap-4" onsubmit={submitRename}>
      <div class="grid gap-1.5">
        <Label for="rename-glossary">Name</Label>
        <Input id="rename-glossary" bind:value={renameValue} required maxlength={200} autocomplete="off" />
      </div>
      <Dialog.Footer>
        <Button variant="outline" type="button" onclick={() => (renameOpen = false)}>Cancel</Button>
        <Button type="submit" disabled={!canRename}>
          {#if renaming}<LoaderIcon class="motion-safe:animate-spin" />{/if}
          Rename
        </Button>
      </Dialog.Footer>
    </form>
  </Dialog.Content>
</Dialog.Root>

<ConfirmDialog
  bind:open={deleteOpen}
  title={`Delete “${deleteTarget?.name ?? ""}”?`}
  description={`This permanently deletes the glossary and its ${pairs(deleteTarget?.dictionaries.length ?? 0)}. This can't be undone.`}
  confirmLabel="Delete"
  onconfirm={confirmDelete}
/>
