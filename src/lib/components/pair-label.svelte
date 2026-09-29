<script lang="ts">
  import ArrowRightIcon from "@lucide/svelte/icons/arrow-right";
  import { cn } from "#lib/utils.js";

  let { source, target, class: className }: { source: string; target: string; class?: string } = $props();
</script>

<span class={cn("inline-flex items-center gap-1 align-middle", className)}>
  {source.toUpperCase()}
  <ArrowRightIcon aria-hidden="true" class="size-[1em] shrink-0" />
  {target.toUpperCase()}
</span>
