<script lang="ts" module>
  import type { GlossaryEntry } from "#lib/glossary/tsv.js";

  /** Number of changed terms between two entry lists, keyed by source term. */
  export function countChanges(original: GlossaryEntry[], current: GlossaryEntry[]): number {
    const before = new Map(original.map((e) => [e.source, e.target]));
    const after = new Map(current.map((e) => [e.source, e.target]));
    let n = 0;
    for (const [source, target] of after) if (before.get(source) !== target) n++;
    for (const source of before.keys()) if (!after.has(source)) n++;
    // Duplicated sources collapse in the maps; count the extra rows as changes too.
    return n + (current.length - after.size);
  }
</script>

<script lang="ts">
  import { Badge } from "#lib/components/ui/badge/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import * as InputGroup from "#lib/components/ui/input-group/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import * as Tooltip from "#lib/components/ui/tooltip/index.js";
  import { validateEntries, type EntryField } from "#lib/glossary/tsv.js";
  import { reportError } from "#lib/ui-state.svelte.js";
  import { cn } from "#lib/utils.js";
  import { pairLabel } from "#lib/utils/languages.js";
  import { beforeNavigate } from "$app/navigation";
  import ChevronLeftIcon from "@lucide/svelte/icons/chevron-left";
  import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
  import LoaderIcon from "@lucide/svelte/icons/loader-circle";
  import PlusIcon from "@lucide/svelte/icons/plus";
  import SearchIcon from "@lucide/svelte/icons/search";
  import Trash2Icon from "@lucide/svelte/icons/trash-2";
  import { tick, untrack } from "svelte";
  import { toast } from "svelte-sonner";
  import { saveDictionary } from "../remote/glossaries.remote.js";

  interface Props {
    glossaryId: string;
    sourceLang: string;
    targetLang: string;
    /** Entries as stored in DeepL. */
    entries: GlossaryEntry[];
    /** Bound so the parent can guard tab switches. */
    dirty?: boolean;
  }

  let { glossaryId, sourceLang, targetLang, entries, dirty = $bindable(false) }: Props = $props();

  interface Row extends GlossaryEntry {
    key: number;
  }

  const PAGE_SIZE = 100;
  /** Paginate only large dictionaries. */
  const PAGINATE_ABOVE = 500;

  let nextKey = 0;
  const toRows = (list: GlossaryEntry[]): Row[] => list.map((e) => ({ ...e, key: nextKey++ }));

  let rows = $state<Row[]>([]);
  let query = $state("");
  let pageIndex = $state(0);
  let saving = $state(false);
  let tableEl = $state<HTMLElement | null>(null);

  // Take the server's entries whenever they change and there are no local edits
  // (first load, after saving, or after another tab changed them).
  let baseline = $state<GlossaryEntry[]>([]);
  $effect.pre(() => {
    const incoming = entries;
    untrack(() => {
      if (dirty && baseline.length > 0) return;
      baseline = incoming;
      rows = toRows(incoming);
    });
  });

  const isBlank = (r: GlossaryEntry) => !r.source.trim() && !r.target.trim();

  /** Rows that will be saved: trimmed, blank rows dropped. Keeps the row index for error mapping. */
  const filled = $derived(
    rows.flatMap((r, index) => (isBlank(r) ? [] : [{ index, source: r.source.trim(), target: r.target.trim() }])),
  );

  const issues = $derived.by(() => {
    const byCell = new Map<string, string>();
    for (const issue of validateEntries(filled)) {
      const row = filled[issue.row]!.index;
      const key = `${row}:${issue.field}`;
      if (!byCell.has(key)) byCell.set(key, issue.message);
    }
    return byCell;
  });

  const changes = $derived(countChanges(baseline, filled));
  $effect(() => {
    dirty = changes > 0;
  });

  // ── Search & paging ────────────────────────────────────────────────────────
  const visible = $derived.by(() => {
    const q = query.trim().toLowerCase();
    const indexed = rows.map((row, index) => ({ row, index }));
    if (!q) return indexed;
    return indexed.filter(({ row }) => row.source.toLowerCase().includes(q) || row.target.toLowerCase().includes(q));
  });
  const paginated = $derived(visible.length > PAGINATE_ABOVE);
  const pageCount = $derived(paginated ? Math.ceil(visible.length / PAGE_SIZE) : 1);
  const pageRows = $derived(paginated ? visible.slice(pageIndex * PAGE_SIZE, (pageIndex + 1) * PAGE_SIZE) : visible);

  $effect(() => {
    if (pageIndex > pageCount - 1) pageIndex = Math.max(0, pageCount - 1);
  });

  // ── Editing ────────────────────────────────────────────────────────────────
  async function addRow() {
    rows.push({ source: "", target: "", key: nextKey++ });
    query = "";
    pageIndex = Math.max(0, Math.ceil(rows.length / PAGE_SIZE) - 1);
    await tick();
    tableEl?.querySelector<HTMLInputElement>("tbody tr:last-child input")?.focus();
  }

  function removeRow(index: number) {
    rows.splice(index, 1);
  }

  function trimCell(row: Row, field: EntryField) {
    const trimmed = row[field].trim();
    if (trimmed !== row[field]) row[field] = trimmed;
  }

  function discard() {
    rows = toRows(baseline);
    query = "";
  }

  async function save() {
    if (issues.size > 0) {
      toast.error("Fix the highlighted rows first.");
      return;
    }
    if (filled.length === 0) {
      toast.error("A language pair needs at least one entry. Delete the pair instead.");
      return;
    }
    saving = true;
    try {
      const entriesToSave = filled.map(({ source, target }) => ({ source, target }));
      await saveDictionary({ id: glossaryId, sourceLang, targetLang, entries: entriesToSave });
      // The server refreshed getEntries in the same response; adopt what we saved right away.
      baseline = entriesToSave;
      rows = toRows(entriesToSave);
      dirty = false;
      toast.success(`Saved ${pairLabel(sourceLang, targetLang)}`, {
        description: `${entriesToSave.length.toLocaleString()} entries`,
      });
    } catch (e) {
      reportError(e, "Couldn't save the dictionary");
    } finally {
      saving = false;
    }
  }

  // ── Unsaved-changes guards ─────────────────────────────────────────────────
  beforeNavigate((nav) => {
    if (!dirty) return;
    if (nav.type === "link" && !nav.willUnload && nav.from?.url.href === nav.to?.url.href) return; // the layout cancels same-page clicks
    if (nav.type === "leave") {
      nav.cancel(); // lets the browser show its own beforeunload prompt
      return;
    }
    if (!confirm("You have unsaved glossary changes. Leave anyway?")) nav.cancel();
  });

  function onkeydown(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      if (dirty && !saving) void save();
    }
  }
</script>

<svelte:window {onkeydown} />

<div class="flex flex-col gap-3">
  <div class="flex flex-wrap items-center gap-2">
    <InputGroup.Root class="w-full sm:w-64">
      <InputGroup.Input bind:value={query} placeholder="Search terms…" aria-label="Search terms" />
      <InputGroup.Addon><SearchIcon /></InputGroup.Addon>
    </InputGroup.Root>
    <span class="text-sm text-muted-foreground tabular-nums">
      {#if query.trim()}{visible.length.toLocaleString("en")} of
      {/if}{rows.length.toLocaleString("en")} rows
    </span>

    <div class="flex items-center gap-2 sm:ml-auto">
      {#if dirty}
        <Badge variant="secondary" aria-live="polite">
          {changes} unsaved {changes === 1 ? "change" : "changes"}
        </Badge>
        <Button variant="ghost" onclick={discard} disabled={saving}>Discard</Button>
      {/if}
      <Button onclick={save} disabled={!dirty || saving}>
        {#if saving}<LoaderIcon class="motion-safe:animate-spin" />{/if}
        Save
      </Button>
    </div>
  </div>

  <div bind:this={tableEl} class="overflow-x-auto rounded-3xl border">
    <table class="w-full text-sm">
      <thead class="border-b bg-muted/40 text-left text-xs text-muted-foreground">
        <tr>
          <th scope="col" class="w-12 px-3 py-2 font-medium">#</th>
          <th scope="col" class="px-2 py-2 font-medium">Source ({sourceLang.toUpperCase()})</th>
          <th scope="col" class="px-2 py-2 font-medium">Target ({targetLang.toUpperCase()})</th>
          <th scope="col" class="w-12 px-2 py-2"><span class="sr-only">Actions</span></th>
        </tr>
      </thead>
      <tbody>
        {#each pageRows as { row, index } (row.key)}
          <tr class="border-b last:border-b-0">
            <td class="px-3 py-1.5 text-xs text-muted-foreground tabular-nums">{index + 1}</td>
            {#each ["source", "target"] as const as field (field)}
              {@const error = issues.get(`${index}:${field}`)}
              <td class="px-1 py-1.5">
                {#snippet cell(props: Record<string, unknown> = {})}
                  <Input
                    {...props}
                    bind:value={row[field]}
                    onblur={() => trimCell(row, field)}
                    aria-label={`${field === "source" ? "Source" : "Target"} term, row ${index + 1}`}
                    aria-invalid={!!error}
                    class={cn("h-8 bg-transparent", error && "bg-destructive/5")}
                  />
                {/snippet}
                {#if error}
                  <Tooltip.Root>
                    <Tooltip.Trigger>
                      {#snippet child({ props })}{@render cell(props)}{/snippet}
                    </Tooltip.Trigger>
                    <Tooltip.Content>{error}</Tooltip.Content>
                  </Tooltip.Root>
                  <span class="sr-only">{error}</span>
                {:else}
                  {@render cell()}
                {/if}
              </td>
            {/each}
            <td class="px-2 py-1.5 text-right">
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Delete row ${index + 1}`}
                onclick={() => removeRow(index)}
              >
                <Trash2Icon />
              </Button>
            </td>
          </tr>
        {:else}
          <tr>
            <td colspan="4" class="px-3 py-8 text-center text-muted-foreground">
              {query.trim() ? "No terms match your search." : "No entries yet. Add a row to get started."}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  <div class="flex flex-wrap items-center gap-2">
    <Button variant="outline" onclick={addRow}>
      <PlusIcon />
      Add row
    </Button>
    {#if issues.size > 0}
      <span class="text-sm text-destructive" role="status">
        {issues.size}
        {issues.size === 1 ? "problem" : "problems"} to fix before saving
      </span>
    {/if}
    {#if paginated}
      <nav class="flex items-center gap-1 sm:ml-auto" aria-label="Pages">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Previous page"
          disabled={pageIndex === 0}
          onclick={() => pageIndex--}
        >
          <ChevronLeftIcon />
        </Button>
        <span class="text-sm text-muted-foreground tabular-nums">Page {pageIndex + 1} of {pageCount}</span>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Next page"
          disabled={pageIndex >= pageCount - 1}
          onclick={() => pageIndex++}
        >
          <ChevronRightIcon />
        </Button>
      </nav>
    {/if}
  </div>
</div>
