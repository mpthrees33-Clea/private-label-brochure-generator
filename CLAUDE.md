# CLAUDE.md

Orientation for Claude Code / any AI assistant working in this repo.

## What this app does

Internal tool for a flooring distributor's reps. Workflow:

1. Rep pastes a **factory product URL** OR **uploads a factory PDF**.
2. App fetches the source and asks Claude to extract structured product info (colors, sizes, tech specs).
3. App renders a 2-page private-label PDF (Letter, Puppeteer) matching the distributor's InDesign template.
4. Product is appended to a **crossover list** — a master mapping of factory products → distributor-branded products, exportable as XLSX.

Default branding is **Trinity Surfaces** (`#177AA9` blue). The codebase is structured so the same engine can be white-labeled for a different distributor — see [§White-labeling](#white-labeling).

## Architecture (one screen)

```
Browser
  │
  │ paste URL / upload PDF
  ▼
src/app/internal/scrape/page.tsx ─────── client: URL ↔ PDF toggle
  │
  ├── URL flow → /internal/brochure/scrape?url=... (server component)
  │              → src/lib/scrapers/index.ts::scrapeProduct(url)
  │                  ├── PDF Content-Type detected? → scrapeFromPdfWithAI
  │                  └── HTML → fetchAndCleanPage + scrapeWithAI
  │
  └── PDF flow → POST /api/scrape/pdf
                 → src/lib/scrapers/ai.ts::scrapeFromPdfWithAI(bytes)
                     (sends the PDF as a `document` content block to Claude)
  │
  ▼
src/lib/scraped-to-brochure.ts          # ScrapedProduct → BrochureData
src/lib/store/products.ts::createProduct
  │
  ▼
/products/[id]                          # editor page
  ├── NameEditor (Trinity name, tagline)
  ├── HeroImageEditor, SwatchImageEditor (paste URL / paste image / upload)
  ├── MissingFieldsPanel (quality gate; spec-sheet backfill)
  ├── EditChat (rep "fix this" prompts → src/lib/scrapers/edit.ts; saves "lessons")
  └── "Download PDF" → /api/brochure/pdf?source=<id>
                       → Puppeteer renders /internal/brochure/[id]
                       → src/lib/pdf/render.ts asserts exactly 2 pages
  ▼
PDF response
```

## Where state lives

- **Product store:** `src/lib/store/products.ts` reads/writes a single JSON blob via `src/lib/store/blob-storage.ts`.
  - Local dev: `/tmp/qfb-store_products.json`
  - VPS prod: `/var/lib/qfb/store/products.json` (configured via env)
  - Vercel legacy: Vercel Blob (no longer used; we moved off Vercel 2026-05-19)
- **Lessons store:** `src/lib/store/lessons.ts` — small JSON of rep corrections from the edit chat, fed back into the scraper prompt so it learns over time. Same blob-storage backend.
- **Uploads:** `src/lib/store/uploads.ts` — image bytes the rep pastes/uploads (hero, swatches). Served from `/api/uploads/[filename]`.
- **Seed products:** `src/lib/store/seed.ts` — 4 reference brochures (Kendall, Lunett, Oberlin, Torrance) that anchor the visual design. Their physical reference PDFs are in `~/.openclaw/workspace/projects/quick-flip-brochures/`.

## Deployment

**Current: self-hosted VPS** (`srv1410919` → brochures.clea-solutions.ai).

- `deploy.sh` — rsyncs source to the VPS, runs `npm ci && next build` remotely, restarts PM2.
- `start.sh` — PM2-launched entrypoint. Sources `.env.production` (kept OUT of rsync) and execs `node .next/standalone/server.js`.
- nginx site `brochures.clea-solutions.ai` → `127.0.0.1:3002`. Cert via certbot.
- Puppeteer uses the system Chromium at `PUPPETEER_EXECUTABLE_PATH` (NOT snap chromium — it fails to launch under Puppeteer).
- `next.config.mjs` has `output: "standalone"` so PM2 can launch a single-file server.

**Legacy: Vercel** — code still has Vercel-aware paths (e.g. `@sparticuz/chromium-min` for the function-size limit) but the app is no longer deployed there. Hit the Fluid Active CPU + Blob Simple Ops free-tier caps.

## The AI scraper, in detail

Lives in `src/lib/scrapers/`. There are two AI calls per scrape:

1. **Product extraction** — `ai.ts::scrapeWithAI` (HTML) or `ai.ts::scrapeFromPdfWithAI` (PDF). One tool call: `extract_product`. Same `SYSTEM_PROMPT` + same `TOOL_SCHEMA`, just different content blocks. Both go through `runExtraction()` which injects "lessons" learned from past rep corrections.

2. **Deep tech-spec pass** — `tech-specs.ts::enrichTechSpecs`. Follows likely spec-sheet links from the product page (PDFs, "data sheet" anchors) and re-asks Claude with the spec-sheet content. Merges into the product. Skipped if the first pass already returned enough specs.

The edit chat (`src/lib/scrapers/edit.ts`) is a third AI surface — used on `/products/[id]` to let the rep say "swap colors A and B" or "this is actually a polished finish, not matte". It returns a JSON patch and, optionally, a "lesson" string that gets stored and later injected into the scraper prompt.

### ⚠ No-hallucination guarantees (do NOT relax)

We hit a hallucination incident on 2026-05-19: a PDF URL got parsed as HTML, the AI was forced (`tool_choice`) to call `extract_product` on near-empty content, and it invented an entire fake brochure ("marlowe / made in italy" for a Mexico product). Defenses now in place — DO NOT remove these to "make scrapes succeed more often":

1. `src/lib/scrapers/index.ts::scrapeProduct` sniffs Content-Type; PDFs go to the PDF scraper.
2. If cleaned HTML is < 400 chars, abort before any AI call.
3. Tool schema requires `documentRecognized: boolean` and `sourceEvidence: string[]` (3-6 verbatim quotes). The AI gate in `runExtraction` throws if `documentRecognized === false` or fewer than 2 evidence quotes.
4. `SYSTEM_PROMPT` explicitly bans inferring country of origin.

## PDF rendering

`src/lib/pdf/render.ts` launches Puppeteer (system Chrome on the VPS via `PUPPETEER_EXECUTABLE_PATH`; `@sparticuz/chromium-min` on Vercel when that env var is unset) and prints HTML produced in-process by `src/lib/pdf/document.tsx` (`page.setContent`, not `page.goto`). CSS and DM Sans are inlined; images are data URIs. Chromium never requests the deployment, so nginx basic auth and Vercel Deployment Protection do not apply, and a serverless function does not need anything listening on `127.0.0.1`. **Asserts exactly 2 pages** — if the rendered HTML produces 1 or 3+ pages, it throws. The 2-page rule is non-negotiable per the distributor's print process.

The brochure layout (`src/lib/brochure-layout.ts`) dynamically sizes swatches so the page-2 content fits regardless of color count. **Swatch aspect ratio must stay 1:2** (mimicking 12"×24" tiles); never distort, shrink proportionally.

## Quality gate

`src/lib/brochure-quality.ts` computes `missingBrochureFields(product)`. The Download PDF button is disabled until the list is empty. `MissingFieldsPanel` surfaces what's missing and offers a spec-sheet URL backfill for tech specs. `/api/brochure/pdf` re-checks the gate server-side so direct URL hits can't bypass it.

## Auth

NextAuth Credentials with a single shared password (`SHARED_PASSWORD` env). Cookie-only. No per-rep accounts. Login page at `/login`.

## White-labeling

The codebase is "Trinity Surfaces by default" but every distributor-specific decision is localized. To rebrand the app for a different distributor:

| Item | Location | Notes |
|---|---|---|
| Logo (used on brochure pages) | `public/brand/trinity-tile-logo.png` | Same filename or update `src/components/brochure/TrinityHeader.tsx`. ~104px wide; PNG with transparent bg. |
| QR code (printed on brochure) | `public/brand/trinity-qr.png` | Encode the distributor's URL. 72×72px in the layout. |
| Phone / email / website on the brochure | `src/components/brochure/ContactBlock.tsx` | Hardcoded strings — swap directly. |
| Brand accent color | `tailwind.config.ts` (`accent.DEFAULT`, `accent.light`, `accent.dim`) + `colors.brochure.trinity` | Hex codes. Also sampled in `BrochureEditor.tsx` for selection highlights — search for `#177AA9`. |
| Brand gray (text on brochure) | `tailwind.config.ts` (`colors.brochure.fg` / `colors.brochure.gray`) | |
| Distributor name in copy | `src/app/page.tsx`, `src/app/internal/scrape/page.tsx`, `src/app/login/page.tsx`, etc. | grep for `Trinity` / `trinity` — 22 files. |
| Header component | `src/components/brochure/TrinityHeader.tsx` | Rename file + symbol if you want. |
| Naming convention for private-label products | `src/lib/scrapers/ai.ts` SYSTEM_PROMPT + `RESERVED_TRINITY_NAMES` set | Trinity uses US town names (kendall, lunett, oberlin, torrance). Edit the prompt + reserved list for a different scheme. |
| Description voice | `src/lib/scrapers/ai.ts` SYSTEM_PROMPT — "suggestedDescription" rule | The "{{name}}" token convention should stay; the voice/example sentence can be rewritten. |
| Factory list (which factories reps work with) | `src/lib/factories.ts` | Add/remove entries. The factory name shown to reps comes from here. |
| Seed reference brochures | `src/lib/store/seed.ts` + `public/sample/*.jpg` | Four reference products. Can be deleted, but the visual reference helps verify the renderer. |
| Sample images | `public/sample/kendall-*.jpg` | Kept only for the hard-coded `/internal/brochure/preview` page; safe to delete if `preview` is removed. |
| App title / metadata | `src/app/layout.tsx` | `<title>` + meta tags. |
| Default shared password | `SHARED_PASSWORD` env | NOT in code — set per environment. |

**Convention used throughout:** the substring `Trinity` (capitalized) appears in UI copy, type names, and prompts; `trinity` (lowercase) appears in CSS class fragments and reserved-name sets. A global rename should treat both forms.

## Conventions and rules of the road

- **Tailwind tokens, not raw colors** — use `bg-bg`, `text-fg`, `border-divider`, `bg-accent`, etc. Defined in `tailwind.config.ts`. Raw hex (e.g. `#177AA9`) appears only in the brochure renderer where Puppeteer needs deterministic colors.
- **The brochure renderer is the single source of design truth** — visual fidelity to the 4 reference PDFs (Kendall, Lunett, Oberlin, Torrance) is the top priority. The reference assets live at `~/.openclaw/workspace/projects/quick-flip-brochures/Trinity Surfaces-selected-assets (3).zip` on the original dev box.
- **Description tokenization** — the AI must write the description with `{{name}}` wherever the product name would appear. The token is substituted at render time so the rep can rename without re-editing copy.
- **No emojis in code or commits** unless the user explicitly asks.
- **Brochure must be exactly 2 pages.** Enforced at PDF generation time. Don't add content that pushes overflow without changing the layout math.
- **Don't relax the no-hallucination defenses** in the AI scraper (see above).

## Stack

- Next.js 14 (App Router) + TypeScript
- Tailwind CSS (custom token palette)
- `@anthropic-ai/sdk` with `claude-sonnet-4-6`
- Puppeteer + system Google Chrome (PDF render)
- `cheerio` (HTML cleaning)
- `exceljs` (XLSX export)
- NextAuth Credentials (shared password)
- Filesystem JSON store (Prisma client exists but is vestigial — see `lib/db.ts`)

## Local dev

```bash
cp .env.example .env.local
# set ANTHROPIC_API_KEY, SHARED_PASSWORD, NEXTAUTH_SECRET, PUPPETEER_EXECUTABLE_PATH
npm install
npm run dev
```

Puppeteer needs a real Chromium binary. On Ubuntu: `apt install google-chrome-stable` and set `PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable`.

## Env vars

| Name | Required | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | yes | All AI calls |
| `SHARED_PASSWORD` | yes (in prod) | Login (NextAuth Credentials) |
| `NEXTAUTH_SECRET` | yes (in prod) | Session signing |
| `NEXTAUTH_URL` | yes (in prod) | Cookie domain |
| `PUPPETEER_EXECUTABLE_PATH` | yes on the VPS | Path to system Chrome for PDF render. Leave unset on Vercel. |
| `CHROMIUM_PACK_URL` | no | Override for the `@sparticuz/chromium-min` pack downloaded on Vercel cold start. Default is the v148.0.0 x64 (or arm64) GitHub release. |
| `QFB_DATA_DIR` | optional | Override `/var/lib/qfb` data root |
| `NEXT_PUBLIC_GA_ID` | optional | Google Analytics measurement ID |
