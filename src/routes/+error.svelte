<script lang="ts">
  import { page } from "$app/state";
  import { resolve } from "$app/paths";
  import { Button } from "#lib/components/ui/button/index.js";
</script>

<svelte:head>
  <title>{page.status} · mytranslate</title>
</svelte:head>

<div class="mx-auto max-w-md py-16 text-center">
  <h1 class="text-6xl font-bold text-foreground">{page.status}</h1>
  {#if page.error?.message}
    <p class="mt-4 text-lg text-muted-foreground">{page.error.message}</p>
  {/if}
  <Button href={resolve("/")} class="mt-8">Back to home</Button>
</div>
