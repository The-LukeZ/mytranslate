# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

A single user: the owner. mytranslate is a personal tool, used on desktop and phone about equally, not tied to one place or workplace. The job is to get a trustworthy DeepL translation of whatever text is at hand, and to keep terminology consistent across translations through the owner's own glossaries.

## Product Purpose

A private front-end for the DeepL API, served from the owner's own subdomain (`translate.thelukez.com`). It does two things:

1. **Translate** text up to 30,000 characters per request, with source/target language, glossary, formality, context and model type.
2. **Manage DeepL v3 glossaries**: list, create, rename, delete, edit entries inline, hold several language pairs per glossary, and add a term straight from a translation.

Success means it replaces deepl.com for day-to-day use: faster to reach, with the options DeepL's own site hides or paywalls (glossaries, context, model choice) always a click away, and with no ads, no account wall and no upsell.

## Positioning

It is the owner's own DeepL key behind the owner's own domain, so it has none of deepl.com's constraints: the API tier decides the features, access is gated by Cloudflare Access, and glossaries are first-class and editable in place instead of being buried. It is a tool for one person, not a product for sale.

## Operating Context

- Content is a mix of everything: short phrases, messages, work documents and long-form text near the character limit. No single length dominates, so both the quick-snippet path and the long-document path must feel right.
- The dominant language pair is **German ↔ English**, in both directions. Other pairs come up occasionally.
- Used on desktop (keyboard-driven: `Ctrl/⌘+Enter` translates, `Ctrl/⌘+Shift+C` copies the output) and on phone (stacked panes, touch).
- The monthly DeepL character quota (Free tier: 500,000) is a real limit the owner watches, so usage stays visible in the app shell.

## Capabilities and Constraints

- **Stack (existing):** SvelteKit on Svelte 5 runes, deployed as a Cloudflare Worker through adapter-cloudflare; shadcn-svelte (bits-ui, Tailwind CSS v4), `@lucide/svelte` icons, `mode-watcher` (light/dark), `svelte-sonner` toasts. Server ↔ client uses SvelteKit remote functions validated with valibot. `ssr = false`.
- **No server storage.** The API key is a Worker secret that never reaches the browser, glossaries live in DeepL, and preferences (languages, glossary per pair, formality, model, options state) live in `localStorage`. Source text and context never leave the tab: back/forward history of translations lives in per-tab `sessionStorage` (SvelteKit snapshots), never in the URL or on the server.
- **No auth code.** Cloudflare Access protects the whole app; `workers.dev` and preview URLs are disabled.
- **Limits:** `MAX_TEXT_CHARS` defaults to 30,000 code points and never goes below 5,000. DeepL's request size limit is 128 KiB. Each glossary term is at most 1024 UTF-8 bytes, a glossary at most 10 MiB, and an account holds at most 1000 glossaries.
- **DeepL rules the UI must respect:** a glossary requires an explicit source language; glossary languages are base codes (`en`), while targets can be regional (`en-US`); formality applies only to targets that support it; context is not translated and not billed.
- **Terminology:** "glossary" (a named DeepL glossary), "language pair" / "dictionary" (one source→target set of entries inside a glossary), "entry" / "term", "usage" (billed characters against the monthly limit).
- **Out of scope for now:** document translation, DeepL Write, style rules, translation memories, several glossaries at once, a translation history list (back/forward between translations exists), CSV/TSV glossary import and export.

## Brand Commitments

- Name: **mytranslate** (lowercase). Domain: `translate.thelukez.com`.
- Light and dark mode are both supported, with a user toggle.
- No logo, mascot or brand assets exist yet; none have been committed to.

## Evidence on Hand

None needed: this is a private single-user tool with no public or marketing surface. Future work must not invent testimonials, user counts, or claims about other users.

## Product Principles

1. **Faster than opening deepl.com.** Opening the app, pasting, translating and copying should take fewer steps than the site it replaces, on desktop and on phone.
2. **German ↔ English first.** The common pair and swapping its direction should be effortless; other languages stay fully available but never get in the way.
3. **Power within reach, not in the way.** Glossaries, formality, context and model are always one step away and never clutter the basic translate path.
4. **Glossaries are a real editor.** Glossary editing is fast and safe: live validation, clear unsaved-change state, no silent data loss.
5. **Honest about limits.** Character counts, quota usage and DeepL errors are shown plainly, in words the owner can act on.

## Accessibility & Inclusion

No external standard is mandated (single user). The established baseline to keep: full keyboard operation with visible focus, `aria` labels on icon-only controls, `prefers-reduced-motion` respected, usable at phone width, and legible in both light and dark themes.
