# Quick Flip Brochures

Trinity Surfaces private-label brochure generator. Rep pastes a factory
product URL, the app scrapes the page, generates a Trinity-branded
2-page PDF, and appends a row to the master crossover list.

## Status

Scaffolding in progress. See `~/.claude/plans/clea-has-saved-the-jolly-lynx.md`
for the full plan.

## Stack

- Next.js 14 (App Router) + TypeScript
- Tailwind (Sales Hub design tokens, `accent` = Trinity blue `#177AA9`)
- Prisma + SQLite (dev) / Postgres (prod)
- NextAuth Credentials (shared password)
- Puppeteer + `@sparticuz/chromium` for PDF generation
- Playwright + Cheerio + Claude (`claude-sonnet-4-6`) for AI scraping
- ExcelJS for crossover XLSX export
- Vercel deploy

## Local setup

```bash
cp .env.example .env.local
# edit .env.local — set SHARED_PASSWORD, ANTHROPIC_API_KEY, NEXTAUTH_SECRET

npm install
npx prisma db push
npm run dev
```

## Brand notes

- Trinity logo is currently a bitmap extracted from the Kendall reference PDF
  (`public/brand/trinity-tile-logo.png`). Replace with a vector SVG once supplied.
- Brochure font is Montserrat (free Google Font, approximates Trinity's
  Brandon Grotesque / Gotham-style brand face). Replace with the real
  brand font if it becomes available.
- Trinity blue: `#177AA9`.

## Factory scraping

15 factories are seeded in `src/lib/factories.ts`. AI extraction is the
default path; per-factory hand-coded adapters live in
`src/lib/scrapers/adapters/` and are only added when AI extraction
proves unreliable for a specific site. See that folder's README.
