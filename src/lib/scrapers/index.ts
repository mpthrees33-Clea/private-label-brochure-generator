import { fetchAndCleanPage } from "./fetch";
import { scrapeFromPdfWithAI, scrapeWithAI } from "./ai";
import { extractCatalog } from "./catalog";
import { enrichTechSpecs, nonNullSpecCount } from "./tech-specs";
import { improveProductImages } from "./images";
import type { ScrapedProduct } from "./types";

// Module-level cache. Survives within a warm serverless function
// instance (~15 min of idle on Vercel). Cold starts wipe it. For
// durable caching we'd persist to the DB once CRUD lands.
const cache = new Map<string, ScrapedProduct>();

// Minimum readable text on the cleaned page before we'll send it to
// the AI. Below this, the page is almost certainly empty / gated / a
// binary we mis-parsed — feeding it to Claude is how we ended up with
// the 2026-05-19 "marlow / made in italy" hallucination.
const MIN_CLEANED_HTML_CHARS = 400;

export async function scrapeProduct(url: string): Promise<ScrapedProduct> {
  const cached = cache.get(url);
  if (cached) return cached;

  // Detect PDF URLs and route them to the PDF scraper instead of the
  // HTML one. fetch + .text() on a PDF returns garbled binary, cheerio
  // returns near-empty content, and the AI happily invents a product
  // to fill the schema. Caught with a HEAD probe first; if HEAD isn't
  // allowed, the GET below also inspects Content-Type before parsing.
  const looksLikePdfUrl = /\.pdf(\?|#|$)/i.test(url);
  if (looksLikePdfUrl) {
    const product = await scrapePdfUrl(url);
    cache.set(url, product);
    return product;
  }

  // GET it once. If the server actually returns a PDF (e.g. URL is a
  // download proxy with no .pdf suffix), pivot to the PDF flow.
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5",
    },
    redirect: "follow",
  });
  if (!res.ok) {
    throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
  }
  const contentType = (res.headers.get("content-type") ?? "").toLowerCase();
  if (contentType.includes("application/pdf")) {
    const bytes = await res.arrayBuffer();
    const product = await scrapeFromPdfWithAI(bytes, url);
    cache.set(url, product);
    return product;
  }
  if (
    !contentType.includes("text/html") &&
    !contentType.includes("application/xhtml") &&
    !contentType.includes("application/xml") &&
    contentType !== ""
  ) {
    throw new Error(
      `Unsupported content-type "${contentType}" at ${url}. Only HTML pages and PDFs are supported.`,
    );
  }

  const html = await res.text();
  const catalog = extractCatalog(html, url);
  const page = await fetchAndCleanPage(url, html);
  if (page.cleanedHtml.length < MIN_CLEANED_HTML_CHARS) {
    throw new Error(
      `The page at ${url} returned only ${page.cleanedHtml.length} characters of readable content — too thin to scrape safely. ` +
        `It may be JavaScript-rendered, gated, or not a product page. ` +
        `Try the direct factory product URL or upload the PDF.`,
    );
  }
  const product = await scrapeWithAI(url, page.cleanedHtml, page.title, catalog);
  await improveProductImages(product, catalog).catch((err) => {
    console.error("improveProductImages failed:", err);
  });

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

async function scrapePdfUrl(url: string): Promise<ScrapedProduct> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; QuickFlipBrochures/1.0)" },
    redirect: "follow",
  });
  if (!res.ok) {
    throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
  }
  const bytes = await res.arrayBuffer();
  if (bytes.byteLength === 0) {
    throw new Error(`PDF at ${url} returned 0 bytes.`);
  }
  return scrapeFromPdfWithAI(bytes, url);
}

export type { ScrapedProduct } from "./types";
