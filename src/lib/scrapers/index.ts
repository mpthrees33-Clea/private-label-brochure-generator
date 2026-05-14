import { fetchAndCleanPage } from "./fetch";
import { scrapeWithAI } from "./ai";
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
  cache.set(url, product);
  return product;
}

export type { ScrapedProduct } from "./types";
