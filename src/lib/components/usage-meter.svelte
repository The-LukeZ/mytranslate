<script lang="ts">
  import { Progress } from "#lib/components/ui/progress/index.js";
  import { cn } from "#lib/utils.js";

  interface Props {
    count: number;
    limit: number;
    highlight?: boolean;
    class?: string;
  }

  let { count, limit, highlight = false, class: className }: Props = $props();

  const percent = $derived(limit > 0 ? (count / limit) * 100 : 0);
  const label = $derived(`${count.toLocaleString("en")} / ${limit.toLocaleString("en")}`);
</script>

<div
  class={cn(
    "flex flex-col gap-1",
    highlight && "rounded-md ring-2 ring-destructive ring-offset-4 ring-offset-background",
    className,
  )}
  title="DeepL characters used this month"
>
  <div class="text-xs text-muted-foreground tabular-nums">
    <span class="sm:hidden">{Math.round(percent)}% used</span>
    <span class="hidden sm:inline">{label}</span>
  </div>
  <Progress
    value={Math.min(count, limit)}
    max={limit || 1}
    class={cn(
      "w-14 sm:w-32",
      percent > 90
        ? "**:data-[slot=progress-indicator]:bg-destructive"
        : percent > 80 && "**:data-[slot=progress-indicator]:bg-amber-500",
    )}
    aria-label={`DeepL usage: ${label} characters`}
  />
</div>
