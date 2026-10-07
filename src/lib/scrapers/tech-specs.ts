import Anthropic from "@anthropic-ai/sdk";
import * as cheerio from "cheerio";
import type { TechSpecs } from "./types";
import type { FetchedAnchor } from "./fetch";
import {
  parseTechSpecItems,
  parseTechSpecsFromHtml,
  groundTechSpecs,
  type SpecTextItem,
} from "./spec-parse";

const SPEC_KEYWORDS = [
  "technical",
  "tech data",
  "tech sheet",
  "tech specs",
  "specs",
  "spec sheet",
  "data sheet",
  "datasheet",
  "downloads",
  "download",
  "tds",
  "tdr",
  "brochure",
  "pdf",
];

const MAX_CANDIDATES = 4;
const MAX_PDF_BYTES = 20 * 1024 * 1024; // 20 MB
const FETCH_TIMEOUT_MS = 12_000;

const FETCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept: "*/*",
  "Accept-Language": "en-US,en;q=0.5",
};

const TOOL_SCHEMA = {
  name: "extract_tech_specs",
  description:
    "Extract the technical specifications table from a tile spec sheet / product brochure / technical-data page. Use null for any spec not stated in the document.",
  input_schema: {
    type: "object",
    properties: {
      thickness: { type: ["string", "null"] },
      shadeVariation: { type: ["string", "null"] },
      waterAbsorption: { type: ["string", "null"] },
      frostResistance: { type: ["string", "null"] },
      stainResistance: { type: ["string", "null"] },
      chemicalResistance: { type: ["string", "null"] },
      scratchHardness: { type: ["string", "null"] },
      breakingStrength: { type: ["string", "null"] },
      dcof: { type: ["string", "null"] },
    },
  },
} as const;

const SYSTEM_PROMPT = `You extract technical specifications from tile / porcelain / ceramic product spec sheets, technical-data pages, and downloadable product brochures.

Return the answer by calling extract_tech_specs exactly once. Use null for any spec not stated in the document.

OUTPUT VALUES MUST BE SHORT — match Trinity Surfaces brochure brevity. Strip all commentary, parentheticals, footnote markers, and prose. Allowed patterns ONLY:
- thickness: "8mm" | "9mm" | "9.5mm" | "6mm - 9.5mm" | "9.5mm | 8.5mm"
- shadeVariation: "v1" | "v2" | "v3" | "v4" | "v2-v3"
- waterAbsorption: "≤ 0.5%" | "≤ 0.1%"
- frostResistance: "resistant"
- stainResistance: "resistant" | "class 5"
- chemicalResistance: "resistant" | "class a"
- scratchHardness: "7" | "8" (single digit only, no "Mohs" prefix)
- breakingStrength: "≥ 450 lbf" | "≥ 250 lbs"
- dcof: "≥ 0.42 wet" | "≥ 0.50 wet" | "matte ≥ 0.50 wet | grip ≥ 0.55 wet"

NEVER include things like "select sizes ≥ 0.42 dry", "matte" / "EW grip" qualifiers other than what's in the patterns above, "C373" codes, or footnote markers. If a value would need clarification, omit the clarification — just give the core number.

Common label aliases on factory spec sheets:
- "thickness" / "nominal thickness" / "tile thickness" → thickness
- "shade variation" / "V1-V4" / "aesthetic variation" / "ISO 10545-2" → shadeVariation
- "water absorption" / "ISO 10545-3" → waterAbsorption
- "frost resistance" / "freeze-thaw" / "ISO 10545-12" → frostResistance
- "stain resistance" / "ISO 10545-14" → stainResistance
- "chemical resistance" / "ISO 10545-13" → chemicalResistance
- "scratch hardness" / "Mohs" / "ISO 10545-7" → scratchHardness
- "breaking strength" / "modulus of rupture" / "ISO 10545-4" → breakingStrength
- "DCOF" / "wet DCOF" / "ANSI A137.1" / "slip resistance" → dcof`;

interface SpecCandidate {
  url: string;
  /** Anchor text or short label, used purely for ranking + logging. */
  hint: string;
  score: number;
}

export function findSpecSheetUrls(anchors: FetchedAnchor[]): SpecCandidate[] {
  const candidates = new Map<string, SpecCandidate>();

  for (const a of anchors) {
    const text = a.text.toLowerCase();
    const href_l = a.url.toLowerCase();
    const isPdf = href_l.endsWith(".pdf") || href_l.includes(".pdf?");

    let score = 0;
    for (const kw of SPEC_KEYWORDS) {
      if (text.includes(kw)) score += 3;
      if (href_l.includes(kw.replace(/\s+/g, ""))) score += 2;
    }
    if (isPdf) score += 4;
    if (score <= 0) continue;

    const prev = candidates.get(a.url);
    if (!prev || prev.score < score) {
      candidates.set(a.url, { url: a.url, hint: text.slice(0, 80), score });
    }
  }

  return [...candidates.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_CANDIDATES);
}

export function nonNullSpecCount(specs: Partial<TechSpecs>): number {
  return Object.values(specs).filter((v) => v != null && v !== "").length;
}

export function mergeSpecs(
  base: Partial<TechSpecs>,
  next: Partial<TechSpecs>,
): Partial<TechSpecs> {
  const out: Partial<TechSpecs> = { ...base };
  for (const [k, v] of Object.entries(next)) {
    if (v != null && v !== "") {
      (out as Record<string, string>)[k] = v;
    }
  }
  return out;
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      headers: FETCH_HEADERS,
      redirect: "follow",
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function extractFromPdf(
  client: Anthropic,
  pdfBytes: ArrayBuffer,
): Promise<Partial<TechSpecs> | null> {
  const base64 = Buffer.from(pdfBytes).toString("base64");
  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    tools: [TOOL_SCHEMA as unknown as Anthropic.Tool],
    tool_choice: { type: "tool", name: "extract_tech_specs" },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: base64,
            },
          } as unknown as Anthropic.TextBlockParam,
          {
            type: "text",
            text: "Extract every tech-spec value listed in this document.",
          },
        ],
      },
    ],
  });
  const tu = message.content.find((c) => c.type === "tool_use");
  if (!tu || tu.type !== "tool_use") return null;
  return tu.input as Partial<TechSpecs>;
}

/**
 * Follow spec sheets, sibling product pages, and a downloads index.
 * Values come from the document text. The model only fills gaps, and
 * only with numbers that appear in that document.
 */
export async function enrichTechSpecs(
  initial: Partial<TechSpecs>,
  anchors: FetchedAnchor[],
  opts?: { pageUrl?: string },
): Promise<Partial<TechSpecs>> {
  if (nonNullSpecCount(initial) >= 6) return initial;
  const token = opts?.pageUrl ? collectionToken(opts.pageUrl) : "";
  const queue = discoverSpecUrls(anchors, opts?.pageUrl);
  const seen = new Set(queue);
  let pdfSpecs: Partial<TechSpecs> = {};
  let htmlSpecs: Partial<TechSpecs> = {};
  let fetched = 0;
  let merged = initial;

  while (queue.length > 0 && fetched < 6 && nonNullSpecCount(merged) < 6) {
    const url = queue.shift()!;
    fetched += 1;
    try {
      const res = await fetchWithTimeout(url);
      if (!res.ok) continue;
      const contentType = (res.headers.get("content-type") ?? "").toLowerCase();
      const isPdf = contentType.includes("application/pdf") || /\.pdf($|\?)/i.test(url);
      if (isPdf) {
        const bytes = await res.arrayBuffer();
        if (bytes.byteLength === 0 || bytes.byteLength > MAX_PDF_BYTES) continue;
        pdfSpecs = fillEmpty(pdfSpecs, await specsFromPdf(bytes));
        merged = fillEmpty(initial, pdfSpecs);
        continue;
      }
      if (
        !contentType.includes("text/html") &&
        !contentType.includes("application/xhtml") &&
        contentType !== ""
      ) {
        continue;
      }
      const html = await res.text();
      // A product page's own line ("Complies", "V2") replaces a number
      // taken from a sitewide chart. A PDF only fills gaps.
      htmlSpecs = { ...htmlSpecs, ...parseTechSpecsFromHtml(html) };
      merged = { ...fillEmpty(initial, pdfSpecs), ...htmlSpecs };
      if (nonNullSpecCount(merged) >= 4 || !token) continue;
      for (const pdf of pdfLinks(html, url, token)) {
        if (seen.has(pdf)) continue;
        seen.add(pdf);
        queue.push(pdf);
      }
    } catch {
      // Partial specs are better than a failed scrape.
    }
  }
  return { ...fillEmpty(initial, pdfSpecs), ...htmlSpecs };
}

function discoverSpecUrls(anchors: FetchedAnchor[], pageUrl?: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (url: string) => {
    if (!url || seen.has(url) || isSkippableSpecUrl(url)) return;
    seen.add(url);
    out.push(url);
  };
  for (const candidate of findSpecSheetUrls(anchors)) push(candidate.url);
  if (!pageUrl) return out;
  const token = collectionToken(pageUrl);
  const products = anchors.filter((anchor) => isSiblingProduct(anchor.url, pageUrl, token));
  for (const anchor of products.slice(0, 2)) push(anchor.url);
  const downloads = anchors.find((anchor) => isDownloadsIndex(anchor, pageUrl));
  if (downloads) push(downloads.url);
  return out;
}

function collectionToken(pageUrl: string): string {
  try {
    const parts = new URL(pageUrl).pathname.split("/").filter(Boolean);
    const skip = new Set([
      "product",
      "products",
      "produto",
      "collections",
      "collection",
      "product-category",
      "category",
    ]);
    return (
      [...parts].reverse().find((part) => part.length >= 4 && !skip.has(part.toLowerCase()))?.toLowerCase() ??
      ""
    );
  } catch {
    return "";
  }
}

function sameHost(a: string, b: string): boolean {
  try {
    const host = (url: string) => new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    return host(a) === host(b);
  } catch {
    return false;
  }
}

function isSiblingProduct(url: string, pageUrl: string, token: string): boolean {
  if (!token || !sameHost(url, pageUrl)) return false;
  try {
    const path = new URL(url).pathname.toLowerCase();
    const pagePath = new URL(pageUrl).pathname.toLowerCase();
    if (path === pagePath) return false;
    if (!path.includes(token)) return false;
    return /\/(products?|produto)\//.test(path);
  } catch {
    return false;
  }
}

function isDownloadsIndex(anchor: FetchedAnchor, pageUrl: string): boolean {
  if (!sameHost(anchor.url, pageUrl)) return false;
  try {
    const path = new URL(anchor.url).pathname.toLowerCase();
    return /\/downloads?\/?$/.test(path) || /^downloads?$/.test(anchor.text.trim().toLowerCase());
  } catch {
    return false;
  }
}

function isSkippableSpecUrl(url: string): boolean {
  return /drive\.google|docs\.google|accounts\.google/i.test(url);
}

function pdfLinks(html: string, pageUrl: string, token: string): string[] {
  const $ = cheerio.load(html);
  const out: string[] = [];
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href") || "";
    if (!/\.pdf($|\?)/i.test(href)) return;
    const text = `${href} ${$(el).text() || ""}`.toLowerCase();
    if (token && !text.includes(token)) return;
    try {
      out.push(new URL(href, pageUrl).toString());
    } catch {
      // ignore
    }
  });
  return out.slice(0, 2);
}

function fillEmpty(base: Partial<TechSpecs>, next: Partial<TechSpecs>): Partial<TechSpecs> {
  const out: Partial<TechSpecs> = { ...base };
  for (const [key, value] of Object.entries(next)) {
    if (value == null || String(value).trim() === "") continue;
    if (!out[key as keyof TechSpecs]) (out as Record<string, string>)[key] = value;
  }
  return out;
}

async function specsFromPdf(bytes: ArrayBuffer): Promise<Partial<TechSpecs>> {
  const items = await pdfItems(bytes);
  const parsed = parseTechSpecItems(items);
  if (nonNullSpecCount(parsed) > 0 || !process.env.ANTHROPIC_API_KEY) return parsed;
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const extracted = await extractFromPdf(client, bytes);
  if (!extracted) return parsed;
  return groundTechSpecs(extracted, items.map((item) => item.str).join(" "));
}

async function pdfItems(bytes: ArrayBuffer): Promise<SpecTextItem[]> {
  const { extractTextItems, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const result = await extractTextItems(pdf);
  const pages = Array.isArray(result) ? result : result.items;
  const items: SpecTextItem[] = [];
  for (const page of pages ?? []) {
    const rows = Array.isArray(page) ? page : [page];
    for (const item of rows) {
      if (!item || typeof item !== "object" || !("str" in item)) continue;
      const text = String(item.str || "");
      if (!text.trim()) continue;
      items.push({
        str: text,
        x: Number(item.x) || 0,
        y: Number(item.y) || 0,
        width: typeof item.width === "number" ? item.width : undefined,
      });
    }
  }
  return items;
}
