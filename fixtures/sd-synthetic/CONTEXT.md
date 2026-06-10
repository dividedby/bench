# CONTEXT — linksnip

`linksnip` is a small URL-shortening HTTP service.

## Domain vocabulary
- **Link** — a stored mapping from a generated **slug** to a **target URL**.
- **Slug** — the short, URL-safe key that identifies a Link (e.g. `linksnip.io/x7Qa`).
- **Mint** — the act of creating a new Link for a target URL.
- **Resolve** — looking up a Link by slug and returning its target URL.
- **Visit** — a single resolve event; visits are counted per Link.
- **Caller** — an identified API client (by API key) that mints and resolves Links.

## Modules today
- `src/http/` — the HTTP layer (route handlers, request/response shaping).
- `src/links/` — Link domain logic: mint, resolve, slug generation.
- `src/store/` — persistence (currently an in-memory map behind a `LinkStore` interface).

## Conventions
- TypeScript, ESM, no framework — a thin handler dispatch over `node:http`.
- Domain logic never imports `node:http`; the HTTP layer adapts.
- Tests live beside code as `*.test.ts`.
