# mytranslate

A front-end for the DeepL API: translate text and manage DeepL v3 glossaries. SvelteKit (Svelte 5 runes) deployed as a Cloudflare Worker.

> [!IMPORTANT]
> The instance deployed from this repo is for personal use only due to the fact that the DeepL API key is a Worker secret and auth is done via CF Access.
> If you want to use this app, fork the repo and deploy your own instance with your own DeepL API key.

## Features

- Translate text (up to `MAX_TEXT_CHARS`, default 30,000 characters) with source/target language, formality, context and model type.
- DeepL v3 glossaries: list, create, rename, delete, edit entries inline, multiple language pairs per glossary, add a term directly from a translation.
- Light/dark theme, keyboard shortcuts (`Ctrl/⌘+Enter` to translate, `Ctrl/⌘+Shift+C` to copy), usage counter against the monthly DeepL quota.
- No server-side storage: the DeepL API key is a Worker secret, glossaries live in DeepL, preferences live in `localStorage`. Source text and context are never persisted.

## Stack

- [SvelteKit](https://kit.svelte.dev/) on Svelte 5, `ssr = false`
- [adapter-cloudflare](https://svelte.dev/docs/kit/adapter-cloudflare), deployed as a Cloudflare Worker
- [shadcn-svelte](https://shadcn-svelte.com/) (bits-ui) + Tailwind CSS v4
- [valibot](https://valibot.dev/) for validating SvelteKit remote functions
- [Wrangler](https://developers.cloudflare.com/workers/wrangler/) for local dev and deploy

## Setup

Requires Node ≥24 and pnpm.

```sh
pnpm install
```

Create a `.dev.vars` file (or copy `.env.example`) with your DeepL API key:

```
DEEPL_API_KEY="your-deepl-api-key"
```

## Development

```sh
pnpm dev
```

## Checks

```sh
pnpm check       # type-check (wrangler types + svelte-check)
pnpm lint        # prettier --check
pnpm format      # prettier --write
pnpm test        # vitest
```

## Deploy

```sh
pnpm deploy      # builds and runs `wrangler deploy`
```

Set the `DEEPL_API_KEY` secret in the Cloudflare Worker before deploying:

```sh
wrangler secret put DEEPL_API_KEY
```

`MAX_TEXT_CHARS` and the custom route/domain are configured in `wrangler.jsonc`.

## Constraints worth knowing

- DeepL request size limit: 128 KiB (`text + context`).
- A glossary term is at most 1024 UTF-8 bytes; a glossary at most 10 MiB; an account holds at most 1000 glossaries.
- A glossary requires an explicit source language. Glossary languages use base codes (`en`); translation targets can be regional (`en-US`). Formality only applies to targets that support it. Context is not translated and not billed.
