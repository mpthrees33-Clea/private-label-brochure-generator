# Per-factory adapter escape hatch

By default Quick Flip uses AI-first scraping (Playwright fetch + Claude
structured extraction with vision input). That works well across most
factory product pages but a specific factory's layout can occasionally
trip up the extractor — strange swatch ordering, lazy-loaded specs,
specs hidden behind tabs, etc.

When that happens for a factory, drop an adapter file here implementing
the `FactoryAdapter` interface from `../types.ts`. The dispatcher in
`../index.ts` checks adapters before falling through to AI extraction.

```ts
// src/lib/scrapers/adapters/example.ts
import type { FactoryAdapter, ScrapedProduct } from "../types";

export const exampleAdapter: FactoryAdapter = {
  matches(url) {
    return /example\.com\/products\//.test(url);
  },
  async scrape(url) {
    // Cheerio or Playwright extraction returning a ScrapedProduct
    return {} as ScrapedProduct;
  },
};
```

Then register it in `src/lib/scrapers/index.ts`.

Empty at launch — no factory has needed an override yet.
