# Quick Flip Brochures

Trinity Surfaces private-label brochure generator. A rep pastes a
factory product URL **or uploads a factory PDF**, the app extracts
the product info with Claude, renders a Trinity-branded 2-page PDF,
and appends the product to a master crossover list (exportable to XLSX).

**Live:** https://brochures.clea-solutions.ai

> **AI assistants / forks / white-labels:** read [CLAUDE.md](./CLAUDE.md)
> first — it covers the full architecture, the no-hallucination
> defenses in the scraper, and a complete map of every distributor-
> specific item if you're rebranding the app for a different company.

---

## Quick tour (test these in the morning)

1. **Dashboard** — https://private-label-brochure-generator.vercel.app/
   - "New brochure" → kicks off the scrape flow
   - "Sample brochure" → hard-coded Kendall layout for visual comparison
   - "Crossover list" → master list + XLSX download
   - Recent products list

2. **Scrape a real factory URL**
   - Go to `/internal/scrape` (or click "New brochure")
   - Paste one of these:
     - `https://www.ragnousa.com/collections/forum-series/` (should map to Torrance)
     - `https://floridatile.com/products/artecrete/` (should map to Kendall-like)
     - `https://www.panaria.us/products/collection/moondance` (should map to Lunett)
     - `https://www.atlasconcorde.com/en/ac-collection/log` (should map to Oberlin)
   - First scrape per URL takes 10–20s (cold start + Claude extraction).
     Subsequent loads of the same URL within ~15 min are cached.
   - You'll see the rendered Trinity brochure.
   - **Save to crossover** persists it, then takes you to the edit form.
   - **Download PDF** renders the same brochure to a real 2-page Letter PDF.

3. **Edit a saved product** — `/products/<id>/edit`
   - Rename Trinity collection + each color's Trinity name
   - Sizes/specs left read-only for V1 (factory data, less commonly edited)
   - Save returns to the product page

4. **Crossover XLSX** — `/crossover`
   - Table view, one row per Trinity color (matches your example sheet)
   - "Download XLSX" produces a file with the original 6-column schema:
     `factory · factory name · factory color · Trinity name · Trinity color · factory link`

5. **Smoke-test the scraper** — quick sanity check per factory:
   ```
   GET /api/scrape/smoke-test?factory=ragno
   GET /api/scrape/smoke-test?factory=atlas-concorde
   GET /api/scrape/smoke-test?factory=florida-tile
   GET /api/scrape/smoke-test?factory=panaria
   ```
   Returns JSON: factory name, color count, sample color, tech spec keys.
   Flag any factory that returns garbage — that one might need a
   hand-coded adapter (see `src/lib/scrapers/adapters/README.md`).

---

## Known V1 limitations

- **Storage is ephemeral.** Products live in `/tmp/quick-flip-products.json`
  on the Vercel serverless instance. When the instance recycles (idle
  ~15 min), the file is wiped and the dashboard reseeds from
  `src/lib/store/seed.ts`. Real durable storage needs Postgres — swap
  out `src/lib/store/products.ts` with a Prisma+Neon implementation.
- **No login.** NextAuth middleware is disabled until `NEXTAUTH_URL`
  env var is set on Vercel. The app is fully open to anyone with the URL
  right now.
- **Sizes/specs not editable in the form.** Only Trinity name + color
  rename. Sizes, availability matrix, and tech specs can be edited via
  the API (`PATCH /api/products/[id]`).
- **Factory color name = Trinity color name** in the crossover for
  scraped products. The form will let you set them separately once
  the rename UX needs it.
- **No "deco" / decorative finishes from scraper yet.** The renderer
  supports them; the AI extractor currently treats every color as
  the standard finish. Pages that have both can be patched after
  smoke-testing.
- **Vercel function size.** Puppeteer + chromium-min is on the edge of
  Vercel's 250 MB limit. Adding more deps may push it over.

## Tech stack

- Next.js 14 (App Router) + TypeScript
- Tailwind (custom token palette, Trinity blue `#177AA9`)
- Puppeteer + system Google Chrome for PDF rendering
- `cheerio` + `@anthropic-ai/sdk` (`claude-sonnet-4-6`) for scraping
- `exceljs` for crossover XLSX export
- Filesystem JSON store (`/var/lib/qfb` on the VPS)
- NextAuth Credentials (shared password)

## Deployment

Self-hosted on the `srv1410919` VPS behind nginx + PM2.

```bash
./deploy.sh         # rsync source, build on the VPS, restart PM2
./deploy.sh logs    # also tail PM2 logs after deploying
```

Build runs **on the VPS** (not locally) so the `.next/standalone` bundle
matches the VPS's exact Node + glibc. Secrets live in
`/var/www/quick-flip-brochures/.env.production` on the VPS and never
ride through rsync.

nginx fronts the app with HTTP Basic auth (realm "Trinity AI Team"). The
PDF renderer must therefore **never** be pointed at the public hostname —
it is a headless browser with no session and no way to answer a password
prompt, so the navigation dies with `net::ERR_INVALID_AUTH_CREDENTIALS`.
It renders over loopback (`http://127.0.0.1:$PORT`) instead, which skips
nginx entirely. Set `QFB_RENDER_ORIGIN` if the app listens somewhere other
than `127.0.0.1:$PORT`.

## Env vars

| Name | Required | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | yes | All AI calls (scrape, edit chat, spec backfill) |
| `SHARED_PASSWORD` | yes in prod | Login (NextAuth Credentials) |
| `NEXTAUTH_SECRET` | yes in prod | Session signing |
| `NEXTAUTH_URL` | yes in prod | Cookie domain |
| `PUPPETEER_EXECUTABLE_PATH` | yes in prod | Path to system Chromium for PDF render (e.g. `/usr/bin/google-chrome-stable`) |
| `QFB_DATA_DIR` | optional | Override `/var/lib/qfb` data root |
| `QFB_RENDER_ORIGIN` | optional | Origin the PDF renderer loads brochure pages from. Defaults to `http://127.0.0.1:$PORT` so it bypasses nginx/basic auth |
| `QFB_RENDER_BASIC_AUTH_USER` | optional | Basic-auth user for the renderer, if it must go through a password-protected proxy |
| `QFB_RENDER_BASIC_AUTH_PASSWORD` | optional | Password paired with the above |
| `NEXT_PUBLIC_GA_ID` | optional | Google Analytics measurement ID |

## Project layout

```
src/
├── app/
│   ├── page.tsx                                # dashboard
│   ├── crossover/page.tsx                      # master list + XLSX link
│   ├── products/[id]/page.tsx                  # saved brochure view
│   ├── products/[id]/edit/                     # edit form
│   ├── internal/scrape/page.tsx                # paste-URL form
│   ├── internal/brochure/preview/              # hard-coded Kendall preview
│   ├── internal/brochure/scrape/               # render scraped brochure
│   ├── internal/brochure/[id]/                 # render saved product
│   └── api/
│       ├── brochure/pdf/route.ts               # Puppeteer PDF generation
│       ├── crossover/xlsx/route.ts             # ExcelJS export
│       ├── products/                           # CRUD endpoints
│       └── scrape/smoke-test/                  # one-shot factory tests
├── components/brochure/                        # the 2-page Brochure renderer
└── lib/
    ├── brochure-layout.ts                      # dynamic swatch sizing
    ├── factories.ts                            # 15 seeded factories
    ├── pdf/render.ts                           # Puppeteer + 2-page assert
    ├── scrapers/                               # AI scraper (fetch + Claude)
    └── store/                                  # JSON-on-/tmp product store
```

## Local dev

```bash
cp .env.example .env.local
# add ANTHROPIC_API_KEY, set DATABASE_URL=file:./dev.db
npm install
npx prisma db push          # (only needed if you swap back to Prisma)
npm run dev                 # → http://localhost:3000 or 3001
```

Local PDF rendering needs a Chromium binary; set
`PUPPETEER_EXECUTABLE_PATH=/path/to/chrome` to use system Chrome.

## What's next

1. Swap the JSON store for Prisma + Postgres (Neon free tier).
2. Re-enable NextAuth once `NEXTAUTH_URL` is set.
3. Extend the AI extractor to handle deco/decorative finishes per color.
4. Add per-factory adapters for any factory where AI consistently
   fails on smoke-test (drop into `src/lib/scrapers/adapters/`).
5. Persist generated PDFs to Vercel Blob so the regenerate button
   can serve cached files without re-rendering.
