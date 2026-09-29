<script lang="ts">
  import { toggleMode } from "mode-watcher";
  import SunIcon from "@lucide/svelte/icons/sun";
  import MoonIcon from "@lucide/svelte/icons/moon";
  import { Button } from "#lib/components/ui/button/index.js";
</script>

<Button variant="ghost" size="icon" class="relative" aria-label="Toggle theme" onclick={toggleMode}>
  <SunIcon class="scale-100 rotate-0 motion-safe:transition-all dark:scale-0 dark:-rotate-90" />
  <MoonIcon class="absolute scale-0 rotate-90 motion-safe:transition-all dark:scale-100 dark:rotate-0" />
  <span class="sr-only">Toggle theme</span>
</Button>
