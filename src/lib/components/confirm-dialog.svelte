<script lang="ts">
  import LoaderIcon from "@lucide/svelte/icons/loader-circle";
  import type { Snippet } from "svelte";
  import * as AlertDialog from "#lib/components/ui/alert-dialog/index.js";
  import { Button } from "#lib/components/ui/button/index.js";

  interface Props {
    open: boolean;
    title: string;
    description?: string | Snippet;
    confirmLabel?: string;
    destructive?: boolean;
    /** Runs on confirm. The dialog stays open (showing a spinner) until it settles, then closes on success. */
    onconfirm: () => Promise<unknown> | unknown;
  }

  let {
    open = $bindable(),
    title,
    description,
    confirmLabel = "Confirm",
    destructive = true,
    onconfirm,
  }: Props = $props();

  let busy = $state(false);

  async function confirm() {
    busy = true;
    try {
      await onconfirm();
      open = false;
    } catch {
      // The caller reports the error; keep the dialog open so the user can retry or cancel.
    } finally {
      busy = false;
    }
  }
</script>

<AlertDialog.Root bind:open>
  <AlertDialog.Content>
    <AlertDialog.Header>
      <AlertDialog.Title>{title}</AlertDialog.Title>
      {#if description}
        <AlertDialog.Description>
          {#if typeof description === "string"}{description}{:else}{@render description()}{/if}
        </AlertDialog.Description>
      {/if}
    </AlertDialog.Header>
    <AlertDialog.Footer>
      <AlertDialog.Cancel disabled={busy}>Cancel</AlertDialog.Cancel>
      <!-- A plain button (not AlertDialog.Action) so the dialog doesn't close before the action finishes. -->
      <Button variant={destructive ? "destructive" : "default"} disabled={busy} onclick={confirm}>
        {#if busy}<LoaderIcon class="motion-safe:animate-spin" />{/if}
        {confirmLabel}
      </Button>
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>
