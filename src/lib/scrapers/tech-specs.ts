import Anthropic from "@anthropic-ai/sdk";
import * as cheerio from "cheerio";
import type { TechSpecs } from "./types";
import type { FetchedAnchor } from "./fetch";

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

async function extractFromHtml(
  client: Anthropic,
  url: string,
  html: string,
): Promise<Partial<TechSpecs> | null> {
  const $ = cheerio.load(html);
  $("script, style, noscript, nav, header, footer").remove();
  const text = ($("body").text() || "").replace(/\s+/g, " ").trim().slice(0, 60_000);
  if (!text) return null;
  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    tools: [TOOL_SCHEMA as unknown as Anthropic.Tool],
    tool_choice: { type: "tool", name: "extract_tech_specs" },
    messages: [
      {
        role: "user",
        content: `Spec page URL: ${url}\n\n${text}`,
      },
    ],
  });
  const tu = message.content.find((c) => c.type === "tool_use");
  if (!tu || tu.type !== "tool_use") return null;
  return tu.input as Partial<TechSpecs>;
}

/**
 * Run a deep tech-spec pass: follow likely spec-sheet links from the
 * factory product page, parse each (HTML or PDF), and merge results.
 * Stops early once enough specs are filled in.
 */
export async function enrichTechSpecs(
  initial: Partial<TechSpecs>,
  anchors: FetchedAnchor[],
): Promise<Partial<TechSpecs>> {
  if (!process.env.ANTHROPIC_API_KEY) return initial;
  if (nonNullSpecCount(initial) >= 7) return initial; // already great
  const candidates = findSpecSheetUrls(anchors);
  if (candidates.length === 0) return initial;

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  let merged = initial;

  for (const c of candidates) {
    try {
      const res = await fetchWithTimeout(c.url);
      if (!res.ok) continue;
      const contentType = (res.headers.get("content-type") ?? "").toLowerCase();
      const isPdf =
        contentType.includes("application/pdf") ||
        c.url.toLowerCase().endsWith(".pdf");

      let extracted: Partial<TechSpecs> | null = null;
      if (isPdf) {
        const bytes = await res.arrayBuffer();
        if (bytes.byteLength > MAX_PDF_BYTES) continue;
        extracted = await extractFromPdf(client, bytes);
      } else if (contentType.includes("text/html") || contentType === "") {
        const html = await res.text();
        extracted = await extractFromHtml(client, c.url, html);
      }
      if (extracted) {
        merged = mergeSpecs(merged, extracted);
        if (nonNullSpecCount(merged) >= 8) break;
      }
    } catch {
      // Skip noisy failures — partial specs are better than no scrape.
    }
  }

  return merged;
}
