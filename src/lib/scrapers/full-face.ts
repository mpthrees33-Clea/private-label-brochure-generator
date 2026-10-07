import * as cheerio from "cheerio";
import { fetch as undiciFetch } from "undici";
import { IMAGE_UA, fetchRemoteImage } from "../image-fetch";
import { trimNearWhite } from "../image-trim";
import { upgradeImageUrl } from "../image-url";
import { aspectWithin } from "../swatch-geometry";
import { canonicalFinish, parseSizeLabel } from "./size-format";
import type { ScrapedColor, ScrapedFace, ScrapedProduct } from "./types";

// A collection card is often a wide crop of a square tile. Sibling SKU
// pages (Shopify products.json, a variant image, or a linked product)
// publish the whole tile. Prefer one whose trimmed shape matches the
// nominal size. This is not specific to any one factory.

const COLLECTION_STOP = new Set([
  "about",
  "ceramic",
  "collection",
  "collections",
  "glazed",
  "porcelain",
  "product",
  "products",
  "series",
  "tile",
  "tiles",
]);

const COLOR_STOP = new Set([
  "and",
  "color",
  "colours",
  "colors",
  "the",
  "tile",
  "with",
]);

export interface SkuImage {
  src: string;
  width?: number | null;
  height?: number | null;
}

export interface SkuListing {
  handle: string;
  title: string;
  images: SkuImage[];
  featuredImages?: SkuImage[];
}

export interface FaceQuery {
  collectionTokens: string[];
  colorTokens: string[];
  finish: string | null;
  widthIn?: number | null;
  heightIn?: number | null;
  ratio: number;
}

interface FetchTextResult {
  ok: boolean;
  contentType: string;
  text: string;
}

export interface FullFaceDeps {
  fetchText?: (url: string) => Promise<FetchTextResult | null>;
  measure?: (url: string) => Promise<{ width: number; height: number } | null>;
}

export function inchKey(widthIn: number, heightIn: number): string {
  const a = Math.min(widthIn, heightIn);
  const b = Math.max(widthIn, heightIn);
  return `${formatIn(a)}x${formatIn(b)}`;
}

function formatIn(n: number): string {
  const rounded = Math.round(n * 10) / 10;
  if (Math.abs(rounded - Math.round(rounded)) < 0.05) return String(Math.round(rounded));
  return String(rounded);
}

export function sizeKeysIn(text: string): string[] {
  const normalized = (text || "").toLowerCase().replace(/(\d)z(\d)/g, "$1x$2").replace(/_/g, ".");
  const keys: string[] = [];
  for (const match of normalized.matchAll(/(\d+(?:\.\d+)?)[x×](\d+(?:\.\d+)?)/g)) {
    const parsed = parseSizeLabel(match[0]);
    if (!parsed || parsed.widthIn <= 0 || parsed.heightIn <= 0) continue;
    if (Math.max(parsed.widthIn, parsed.heightIn) > 48) continue;
    keys.push(inchKey(parsed.widthIn, parsed.heightIn));
  }
  return [...new Set(keys)];
}

export function collectionTokens(name: string, pageUrl: string): string[] {
  let slug = "";
  try {
    slug = new URL(pageUrl).pathname.split("/").filter(Boolean).pop() ?? "";
  } catch {
    slug = "";
  }
  const raw = `${name} ${slug.replace(/-/g, " ")}`.toLowerCase();
  const tokens = raw
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 4 && !COLLECTION_STOP.has(token));
  return [...new Set(tokens)];
}

export function colorTokens(name: string): string[] {
  return (name || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3 && !COLOR_STOP.has(token) && !/^\d+$/.test(token));
}

function wordHas(hay: string, word: string): boolean {
  return new RegExp(`(?:^|\\s)${escapeRegExp(word)}(?:\\s|$)`).test(hay);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Finishes named in a handle or title, longest phrases first. */
export function finishesIn(text: string): string[] {
  let hay = (text || "").toLowerCase().replace(/[-_]+/g, " ");
  const found: string[] = [];
  const take = (id: string, re: RegExp) => {
    if (re.test(hay)) {
      found.push(id);
      hay = hay.replace(re, " ");
    }
  };
  take("deep glaze", /deep\s*glaze/);
  take("semi-gloss", /semi\s*gloss/);
  take("glossy", /glossy|\bgloss\b/);
  take("polished", /polished|\bpolish\b|lappato/);
  take("textured", /textured|\btexture\b/);
  take("matte", /\bmatte\b|\bmatt\b/);
  take("grip", /\bgrip\b/);
  take("silk", /\bsilk\b/);
  return found;
}

function normalizeHay(handle: string, title: string): string {
  return `${handle} ${title}`.toLowerCase().replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Higher is a better sibling SKU. Zero means the listing is a different
 * color, finish, size, or collection.
 */
export function scoreSkuListing(listing: SkuListing, query: FaceQuery): number {
  const hay = normalizeHay(listing.handle, listing.title);
  if (query.collectionTokens.length > 0) {
    const hit = query.collectionTokens.some((token) => wordHas(hay, token));
    if (!hit) return 0;
  }
  if (query.colorTokens.length === 0) return 0;
  if (!query.colorTokens.every((token) => wordHas(hay, token))) return 0;

  const finishes = finishesIn(hay);
  if (query.finish) {
    if (!finishes.includes(query.finish)) return 0;
    if (finishes.some((finish) => finish !== query.finish)) return 0;
  }

  if (query.widthIn && query.heightIn && query.widthIn > 0 && query.heightIn > 0) {
    const want = inchKey(query.widthIn, query.heightIn);
    const sizes = sizeKeysIn(`${listing.handle} ${listing.title}`);
    if (!sizes.includes(want)) return 0;
    if (sizes.some((size) => size !== want)) return 0;
  }

  let score = 10;
  if (query.finish) score += 4;
  if (query.collectionTokens.some((token) => listing.handle.toLowerCase().includes(token))) score += 2;
  return score;
}

export function orderedListingImages(listing: SkuListing): SkuImage[] {
  const seen = new Set<string>();
  const out: SkuImage[] = [];
  const push = (image?: SkuImage | null) => {
    const src = (image?.src || "").trim();
    if (!src) return;
    const key = src.split("?")[0];
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ src, width: image?.width, height: image?.height });
  };
  for (const image of listing.images) push(image);
  for (const image of listing.featuredImages ?? []) push(image);
  return out;
}

export function listingsFromShopifyPayload(data: unknown): SkuListing[] {
  const products = Array.isArray(data)
    ? data
    : data && typeof data === "object" && Array.isArray((data as { products?: unknown }).products)
      ? (data as { products: unknown[] }).products
      : [];
  const listings: SkuListing[] = [];
  for (const raw of products) {
    if (!raw || typeof raw !== "object") continue;
    const product = raw as {
      handle?: string;
      title?: string;
      images?: unknown[];
      media?: unknown[];
      variants?: unknown[];
    };
    const images = shopifyImages(product.images).concat(shopifyImages(product.media));
    const featured = (product.variants ?? []).flatMap((variant) => {
      if (!variant || typeof variant !== "object") return [];
      const featuredImage = (variant as { featured_image?: unknown }).featured_image;
      return shopifyImages(featuredImage ? [featuredImage] : []);
    });
    if (!product.handle && !product.title) continue;
    listings.push({
      handle: product.handle || "",
      title: product.title || "",
      images,
      featuredImages: featured,
    });
  }
  return listings;
}

function shopifyImages(value: unknown): SkuImage[] {
  if (!Array.isArray(value)) return [];
  const images: SkuImage[] = [];
  for (const item of value) {
    if (typeof item === "string" && item.trim()) {
      images.push({ src: absoluteShopify(item) });
      continue;
    }
    if (!item || typeof item !== "object") continue;
    const record = item as { src?: string; url?: string; width?: number; height?: number };
    const src = record.src || record.url || "";
    if (!src.trim()) continue;
    images.push({
      src: absoluteShopify(src),
      width: typeof record.width === "number" ? record.width : null,
      height: typeof record.height === "number" ? record.height : null,
    });
  }
  return images;
}

function absoluteShopify(src: string): string {
  if (src.startsWith("//")) return `https:${src}`;
  return src;
}

export async function imageForListing(
  listing: SkuListing,
  ratio: number,
  measure: (url: string) => Promise<{ width: number; height: number } | null>,
): Promise<{ url: string; width: number; height: number } | null> {
  const images = orderedListingImages(listing);
  for (const image of images) {
    if (image.width && image.height && aspectWithin(image.width, image.height, ratio)) {
      return { url: image.src, width: image.width, height: image.height };
    }
  }
  let measured = 0;
  for (const image of images) {
    if (measured >= 2) break;
    measured += 1;
    const box = await measure(image.src);
    if (box && aspectWithin(box.width, box.height, ratio)) {
      return { url: image.src, width: box.width, height: box.height };
    }
  }
  return null;
}

function needsBetterPhoto(face: ScrapedFace): boolean {
  if (face.sizeUnknown || !face.aspectRatio || face.aspectRatio <= 0) return false;
  if (!face.photoWidth || !face.photoHeight) return false;
  return !aspectWithin(face.photoWidth, face.photoHeight, face.aspectRatio);
}

function queryFor(product: ScrapedProduct, color: ScrapedColor, face: ScrapedFace, pageUrl: string): FaceQuery {
  return {
    collectionTokens: collectionTokens(product.factoryName || "", pageUrl),
    colorTokens: colorTokens(color.name),
    finish: canonicalFinish(face.finish),
    widthIn: face.widthIn,
    heightIn: face.heightIn,
    ratio: face.aspectRatio || 1,
  };
}

export async function upgradeFullFaceImages(
  product: ScrapedProduct,
  ctx: { pageUrl: string; html?: string },
  deps: FullFaceDeps = {},
): Promise<void> {
  const pending: Array<{ color: ScrapedColor; face: ScrapedFace }> = [];
  for (const color of product.colors) {
    for (const face of color.faces ?? []) {
      if (needsBetterPhoto(face)) pending.push({ color, face });
    }
  }
  if (pending.length === 0) return;

  const fetchText = deps.fetchText ?? defaultFetchText;
  const measure = deps.measure ?? defaultMeasure;
  const measured = new Map<string, { width: number; height: number } | null>();
  const measureCached = async (url: string) => {
    const key = url.split("?")[0];
    if (measured.has(key)) return measured.get(key) ?? null;
    const box = await measure(url);
    measured.set(key, box);
    return box;
  };

  let origin = "";
  try {
    origin = new URL(ctx.pageUrl).origin;
  } catch {
    origin = "";
  }
  const listings = origin ? await loadShopifyListings(origin, fetchText) : [];

  for (const item of pending) {
    const query = queryFor(product, item.color, item.face, ctx.pageUrl);
    const chosen = await chooseImage(listings, query, origin, ctx, fetchText, measureCached);
    if (chosen) {
      item.face.imageUrl = upgradeImageUrl(chosen.url);
      item.face.photoWidth = chosen.width;
      item.face.photoHeight = chosen.height;
      item.face.photoMismatch = false;
    } else {
      item.face.photoMismatch = true;
    }
  }

  for (const color of product.colors) {
    const lead = (color.faces ?? []).find((face) => face.imageUrl);
    if (lead) color.imageUrl = lead.imageUrl;
    const deco = (color.faces ?? []).find((face) => face.isDeco && face.imageUrl);
    if (deco) color.decoImageUrl = deco.imageUrl;
  }
}

async function chooseImage(
  listings: SkuListing[],
  query: FaceQuery,
  origin: string,
  ctx: { pageUrl: string; html?: string },
  fetchText: (url: string) => Promise<FetchTextResult | null>,
  measure: (url: string) => Promise<{ width: number; height: number } | null>,
): Promise<{ url: string; width: number; height: number } | null> {
  const ranked = listings
    .map((listing) => ({ listing, score: scoreSkuListing(listing, query) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score);
  for (const row of ranked.slice(0, 3)) {
    const image = await imageForListing(row.listing, query.ratio, measure);
    if (image) return image;
  }
  if (origin && ranked.length === 0) {
    const searched = await searchShopify(origin, query, fetchText);
    for (const listing of searched.slice(0, 3)) {
      const image = await imageForListing(listing, query.ratio, measure);
      if (image) return image;
    }
  }
  if (ctx.html && origin) {
    const links = linkedSkuPages(ctx.html, ctx.pageUrl, query).slice(0, 3);
    for (const link of links) {
      const page = await fetchText(link);
      if (!page || !/html/i.test(page.contentType)) continue;
      const listing = listingFromHtml(page.text, link);
      const image = await imageForListing(listing, query.ratio, measure);
      if (image) return image;
    }
  }
  return null;
}

async function loadShopifyListings(
  origin: string,
  fetchText: (url: string) => Promise<FetchTextResult | null>,
): Promise<SkuListing[]> {
  const all: SkuListing[] = [];
  for (let page = 1; page <= 4; page++) {
    const url = `${origin}/collections/all/products.json?limit=250&page=${page}`;
    const res = await fetchText(url);
    if (!res || !res.ok || !/json/i.test(res.contentType)) break;
    let parsed: unknown;
    try {
      parsed = JSON.parse(res.text);
    } catch {
      break;
    }
    const batch = listingsFromShopifyPayload(parsed);
    all.push(...batch);
    if (batch.length < 250) break;
  }
  return all;
}

async function searchShopify(
  origin: string,
  query: FaceQuery,
  fetchText: (url: string) => Promise<FetchTextResult | null>,
): Promise<SkuListing[]> {
  const q = [
    ...query.collectionTokens,
    ...query.colorTokens,
    query.finish ?? "",
    query.widthIn && query.heightIn ? inchKey(query.widthIn, query.heightIn) : "",
  ]
    .filter(Boolean)
    .join(" ");
  if (!q.trim()) return [];
  const url = `${origin}/search/suggest.json?q=${encodeURIComponent(q)}&resources[type]=product&resources[limit]=8`;
  const res = await fetchText(url);
  if (!res || !res.ok || !/json/i.test(res.contentType)) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(res.text);
  } catch {
    return [];
  }
  const products = suggestProducts(parsed);
  const listings: SkuListing[] = [];
  for (const product of products.slice(0, 3)) {
    if (product.handle) {
      const detail = await fetchText(`${origin}/products/${product.handle}.js`);
      if (detail && detail.ok && /json/i.test(detail.contentType)) {
        try {
          const body = JSON.parse(detail.text) as unknown;
          const fromJs = listingsFromShopifyPayload([body]);
          if (fromJs.length > 0) {
            listings.push(fromJs[0]);
            continue;
          }
        } catch {
          // fall through to the suggest stub
        }
      }
    }
    listings.push(product);
  }
  return listings;
}

function suggestProducts(data: unknown): SkuListing[] {
  if (!data || typeof data !== "object") return [];
  const resources = (data as { resources?: { results?: { products?: unknown[] } } }).resources;
  const products = resources?.results?.products;
  if (!Array.isArray(products)) return [];
  return products.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const product = item as { handle?: string; title?: string; image?: string };
    return [
      {
        handle: product.handle || "",
        title: product.title || "",
        images: product.image ? [{ src: absoluteShopify(product.image) }] : [],
      },
    ];
  });
}

function linkedSkuPages(html: string, pageUrl: string, query: FaceQuery): string[] {
  let origin = "";
  try {
    origin = new URL(pageUrl).origin;
  } catch {
    return [];
  }
  const $ = cheerio.load(html);
  const links: string[] = [];
  $("a[href]").each((_, anchor) => {
    if ($(anchor).closest("nav, header, footer").length) return;
    const href = $(anchor).attr("href") || "";
    if (!href || href.startsWith("#") || href.startsWith("mailto:")) return;
    let abs = "";
    try {
      abs = new URL(href, pageUrl).toString();
    } catch {
      return;
    }
    if (new URL(abs).origin !== origin) return;
    if (abs.split("#")[0] === pageUrl.split("#")[0]) return;
    const text = $(anchor).text() || "";
    const score = scoreSkuListing({ handle: abs, title: text, images: [] }, query);
    if (score > 0) links.push(abs.split("#")[0]);
  });
  return [...new Set(links)];
}

function listingFromHtml(html: string, pageUrl: string): SkuListing {
  const $ = cheerio.load(html);
  const title = $("title").first().text() || "";
  const images: SkuImage[] = [];
  const og = $('meta[property="og:image"]').attr("content");
  if (og) {
    try {
      images.push({ src: new URL(og, pageUrl).toString() });
    } catch {
      // ignore a broken og:image
    }
  }
  $("img").each((_, img) => {
    if ($(img).closest("nav, header, footer").length) return;
    const src = $(img).attr("src") || "";
    if (!src || src.startsWith("data:")) return;
    try {
      const width = Number($(img).attr("width"));
      const height = Number($(img).attr("height"));
      images.push({
        src: new URL(src, pageUrl).toString(),
        width: width >= 80 ? width : null,
        height: height >= 80 ? height : null,
      });
    } catch {
      // skip unresolvable src
    }
  });
  let handle = pageUrl;
  try {
    handle = new URL(pageUrl).pathname;
  } catch {
    handle = pageUrl;
  }
  return { handle, title, images };
}

async function defaultFetchText(url: string): Promise<FetchTextResult | null> {
  try {
    const res = await undiciFetch(url, {
      headers: {
        "User-Agent": IMAGE_UA,
        Accept: "application/json,text/html;q=0.9,*/*;q=0.8",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return null;
    return {
      ok: true,
      contentType: res.headers.get("content-type") ?? "",
      text: await res.text(),
    };
  } catch {
    return null;
  }
}

async function defaultMeasure(url: string): Promise<{ width: number; height: number } | null> {
  const file = await fetchRemoteImage(url);
  if (!file) return null;
  const trimmed = await trimNearWhite(file.bytes);
  if (trimmed.width < 8 || trimmed.height < 8) return null;
  return { width: trimmed.width, height: trimmed.height };
}
