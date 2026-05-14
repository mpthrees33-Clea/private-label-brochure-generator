import { fetchAndCleanPage } from "./fetch";
import { scrapeWithAI } from "./ai";
import { enrichTechSpecs, nonNullSpecCount } from "./tech-specs";
import type { ScrapedProduct } from "./types";

// Module-level cache. Survives within a warm serverless function
// instance (~15 min of idle on Vercel). Cold starts wipe it. For
// durable caching we'd persist to the DB once CRUD lands.
const cache = new Map<string, ScrapedProduct>();

export async function scrapeProduct(url: string): Promise<ScrapedProduct> {
  const cached = cache.get(url);
  if (cached) return cached;
  const page = await fetchAndCleanPage(url);
  const product = await scrapeWithAI(url, page.cleanedHtml, page.title);

  // Deep tech-spec pass: factories usually only print 1-2 specs on the
  // product page itself. The full table lives on a linked "Technical
  // Data" / spec sheet / PDF brochure. Skip if Claude already pulled
  // a solid set on the first pass.
  if (nonNullSpecCount(product.techSpecs) < 5) {
    try {
      product.techSpecs = await enrichTechSpecs(
        product.techSpecs,
        page.anchors,
      );
    } catch (err) {
      // Partial specs are better than failed scrape. Log and continue.
      console.error("enrichTechSpecs failed:", err);
    }
  }

  cache.set(url, product);
  return product;
}

export type { ScrapedProduct } from "./types";
