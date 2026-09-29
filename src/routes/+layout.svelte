<script lang="ts">
  import "./layout.css";
  import LanguagesIcon from "@lucide/svelte/icons/languages";
  import { ModeWatcher } from "mode-watcher";
  import { page } from "$app/state";
  import { resolve } from "$app/paths";
  import { watchAccessSession } from "#lib/access-session.js";
  import favicon from "#lib/assets/favicon.svg";
  import ThemeToggle from "#lib/components/theme-toggle.svelte";
  import UsageMeter from "#lib/components/usage-meter.svelte";
  import { Toaster } from "#lib/components/ui/sonner/index.js";
  import * as Tooltip from "#lib/components/ui/tooltip/index.js";
  import { THEME_COLORS } from "#lib/config.js";
  import { ui } from "#lib/ui-state.svelte.js";
  import { cn } from "#lib/utils.js";
  import { getUsage } from "./meta.remote";

  let { children } = $props();

  const usage = getUsage();

  $effect(() => watchAccessSession());

  const nav = [
    { href: resolve("/"), label: "Translate", match: (p: string) => p === "/" },
    { href: resolve("/glossaries"), label: "Glossaries", match: (p: string) => p.startsWith("/glossaries") },
  ];
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

<!-- The initial-mode script is injected in app.html (with the CSP nonce) by hooks.server.ts. -->
<ModeWatcher disableHeadScriptInjection themeColors={THEME_COLORS} />
<Toaster richColors closeButton position="bottom-right" />

<Tooltip.Provider>
  <div class="flex min-h-dvh flex-col">
    <header class="sticky top-0 z-40 border-b bg-background/80 backdrop-blur supports-backdrop-filter:bg-background/60">
      <div class="mx-auto flex h-14 max-w-6xl items-center gap-2 px-4 sm:gap-4">
        <a href={resolve("/")} class="flex items-center gap-2 font-semibold tracking-tight">
          <LanguagesIcon class="size-5" aria-hidden="true" />
          <span class="hidden sm:inline">mytranslate</span>
        </a>

        <nav aria-label="Main" class="flex items-center gap-1">
          {#each nav as item (item.href)}
            {@const active = item.match(page.url.pathname)}
            <a
              href={item.href}
              aria-current={active ? "page" : undefined}
              class={cn(
                "rounded-xl px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                active && "bg-muted font-medium text-foreground",
              )}
            >
              {item.label}
            </a>
          {/each}
        </nav>

        <div class="ml-auto flex items-center gap-2 sm:gap-3">
          {#if usage.current}
            <UsageMeter
              count={usage.current.character_count}
              limit={usage.current.character_limit}
              highlight={ui.quotaExceeded}
            />
          {/if}
          <ThemeToggle />
        </div>
      </div>
    </header>

    <main class="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
      {@render children()}
    </main>
  </div>
</Tooltip.Provider>
