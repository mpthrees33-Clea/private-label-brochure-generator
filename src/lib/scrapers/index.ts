import { fetchAndCleanPage, fetchFactoryDocument } from "./fetch";
import { scrapeFromPdfWithAI, scrapeWithAI } from "./ai";
import { extractCatalog } from "./catalog";
import { supplementFromLinkedPages } from "./linked-pages";
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

  // GET it once. A 429/403 is retried, then loaded in Chrome, and if the
  // site still refuses, the error points at the Upload PDF tab.
  const doc = await fetchFactoryDocument(url);
  const contentType = doc.contentType.toLowerCase();
  if (contentType.includes("application/pdf")) {
    const bytes = doc.bytes.buffer.slice(doc.bytes.byteOffset, doc.bytes.byteOffset + doc.bytes.byteLength) as ArrayBuffer;
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

  const html = new TextDecoder().decode(doc.bytes);
  const catalog = extractCatalog(html, url);
  const page = await fetchAndCleanPage(url, html);
  if (page.cleanedHtml.length < MIN_CLEANED_HTML_CHARS) {
    throw new Error(
      `The page at ${url} returned only ${page.cleanedHtml.length} characters of readable content — too thin to scrape safely. ` +
        `It may be JavaScript-rendered, gated, or not a product page. ` +
        `Try the direct factory product URL or upload the PDF.`,
    );
  }
  const product = await scrapeWithAI(url, page.cleanedHtml, page.title, catalog, html);
  await supplementFromLinkedPages(product, html, page.anchors, url).catch((err) => {
    console.error("supplementFromLinkedPages failed:", err);
  });
  await improveProductImages(product, catalog).catch((err) => {
    console.error("improveProductImages failed:", err);
  });

  // Deep tech-spec pass: factories usually only print 1-2 specs on the
  // product page itself. The full table lives on a linked "Technical
  // Data" / spec sheet / PDF brochure. Skip if Claude already pulled
  // a solid set on the first pass.
  if (nonNullSpecCount(product.techSpecs) < 6) {
    try {
      product.techSpecs = await enrichTechSpecs(product.techSpecs, page.anchors, {
        pageUrl: url,
      });
    } catch (err) {
      // Partial specs are better than failed scrape. Log and continue.
      console.error("enrichTechSpecs failed:", err);
    }
  }

  cache.set(url, product);
  return product;
}

async function scrapePdfUrl(url: string): Promise<ScrapedProduct> {
  const doc = await fetchFactoryDocument(url);
  if (doc.bytes.byteLength === 0) {
    throw new Error(`PDF at ${url} returned 0 bytes.`);
  }
  const bytes = doc.bytes.buffer.slice(
    doc.bytes.byteOffset,
    doc.bytes.byteOffset + doc.bytes.byteLength,
  ) as ArrayBuffer;
  return scrapeFromPdfWithAI(bytes, url);
}

export type { ScrapedProduct } from "./types";
