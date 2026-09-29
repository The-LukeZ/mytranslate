# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

mytranslate: private front-end for the DeepL API (translate text, manage DeepL v3 glossaries). SvelteKit + Svelte 5 runes, deployed as a Cloudflare Worker via `adapter-cloudflare`. Single-user tool; Cloudflare Access gates the whole app, so there is no auth code. `PRODUCT.md` holds product context and terminology (glossary / language pair / entry / usage).

## Commands

Package manager is pnpm (Node ≥24).

```sh
pnpm dev                                  # vite dev (needs DEEPL_API_KEY in .env)
pnpm check                                # wrangler types --check + svelte-kit sync + svelte-check
pnpm lint                                 # prettier --check .
pnpm format                               # prettier --write .
pnpm test                                 # vitest --run (all)
pnpm test:unit                            # vitest watch
pnpm vitest run src/lib/glossary/tsv.test.ts   # single test file
pnpm vitest run -t "name"                 # single test by name
pnpm gen                                  # regenerate worker-configuration.d.ts (wrangler types)
pnpm build / pnpm preview / pnpm deploy   # build, run in wrangler dev, build + wrangler deploy
```

`build` and `check` fail if `worker-configuration.d.ts` is stale: run `pnpm gen` after editing `wrangler.jsonc` (vars/secrets).

## Architecture

- **`ssr = false`** (`src/routes/+layout.ts`): the app renders only in the browser so `localStorage` prefs apply on first paint.
- **Server ↔ client = SvelteKit remote functions** (`experimental.remoteFunctions` + `compilerOptions.experimental.async` in `vite.config.ts`). `src/routes/*.remote.ts` (`translate`, `glossaries`, `meta`) export `query`/`command` validated with valibot schemas from `src/lib/schemas.ts`. There are no `+server.ts` endpoints.
- **DeepL layer** in `src/lib/server/deepl/`: `client.ts` (`ky` instance, picks free/pro base URL from the `:fx` key suffix, retry policy — glossary create only retries 429/529 to avoid duplicates), `errors.ts` (`DeepLApiError` with a safe `userMessage`), plus `translate.ts`, `glossaries.ts`, `languages.ts`, `types.ts`. Remote functions wrap every DeepL call in `withDeepL()` (`src/lib/server/with-deepl.ts`) which converts `DeepLApiError` to a SvelteKit `error()`. `hooks.server.ts` `handleError` hides unknown errors from the browser and logs them for Workers observability.
- **Env vars** are declared in `src/env.ts` via `defineEnvVars` and imported from `$app/env/private` (server-only) — not `$env/*` or `platform.env`. `DEEPL_API_KEY` is a Worker secret (`.env` in dev); `MAX_TEXT_CHARS` is a `wrangler.jsonc` var, clamped to ≥5,000 by `clampMaxTextChars` in `src/lib/config.ts`.
- **No server storage.** Glossaries live in DeepL. Client prefs live in `localStorage` (`src/lib/prefs.svelte.ts`, guarded for unavailable storage); source text and context are never persisted. `src/lib/ui-state.svelte.ts` holds app-wide flags and `reportError()` (toasts; status 456 sets `quotaExceeded`).
- **Session expiry**: `src/lib/access-session.ts` probes `manifest.json` on `visibilitychange` because an installed PWA never gets Access's login redirect.
- **CSP** is configured in `vite.config.ts` (`csp.mode: "auto"`); inline scripts need the nonce, which is why mode-watcher's init script is injected in `hooks.server.ts` into the `%modewatcher.script%` placeholder in `app.html`.
- **Domain rules to respect** (also in README): a glossary needs an explicit source language; glossary languages are base codes (`en`), translation targets can be regional (`en-US`); formality only applies to supporting targets; glossary entries are exchanged as TSV (`src/lib/glossary/tsv.ts`).

## Conventions

- Import alias: `#lib` / `#lib/*` (package.json `imports`, resolves to `src/lib`), used with `.js` extensions, e.g. `#lib/schemas.js`. `$lib` is not used.
- Svelte runes mode is forced project-wide; use `$state`/`$derived`/`$props`, and `.svelte.ts` for reactive modules.
- `src/lib/components/ui/` is generated shadcn-svelte (bits-ui) code (`components.json`); app components live directly in `src/lib/components/`.
- Tests are vitest, node environment, `src/**/*.test.ts` only; `expect.requireAssertions` is on, so every test must assert. The DeepL client accepts injected `fetch`/`retryDelay` for tests.
- Formatting is prettier (with svelte + tailwind plugins); run `pnpm format`.
