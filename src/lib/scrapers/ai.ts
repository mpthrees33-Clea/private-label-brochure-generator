import Anthropic from "@anthropic-ai/sdk";
import type { ScrapedProduct, SizeIcon } from "./types";
import { factoryFromUrl } from "../factories";
import { relevantLessonsForScrape } from "../store/lessons";
import { catalogSummary, type PageCatalog } from "./catalog";
import { finalizeScrapedProduct } from "./normalize";
import { isPlaceholderName, RESERVED_TRINITY_NAMES } from "../trinity-names";

const SYSTEM_PROMPT = `You extract structured tile / flooring product info from factory product pages for the Trinity Surfaces private-label brochure generator.

Return your answer by calling the extract_product tool exactly once. Do not include any other text.

Rules:
- Use absolute image URLs (https://...). Pick the cleanest swatch images for "imageUrl" — the standalone color/finish tile photo, not a lifestyle scene, logo, or icon. Prefer a higher-resolution twin (Florida Tile "_larger" over "_public") when both exist. "decoImageUrl" is the deco face of that SAME color, or null. Never use a logo or arrow as a swatch.
- If the source is a PDF spec sheet (no factory URL — images are embedded raster only), use empty string "" for "imageUrl", "decoImageUrl", and "heroImageUrl". The rep will add image URLs on the editing page. Still extract every color name and size from the document.
- "heroImageUrl" is the best single lifestyle / room-scene image showing the product installed.
- product name / color names should be reproduced as-is from the factory page (we'll lowercase them downstream).
- "factoryName" is the collection name in the page H1 or title (e.g. "Eclipta", "Fluent"). Never a place name that only appears inside the marketing story (Eclipta's copy mentions Matera — the collection is still Eclipta) and never a sibling collection from nav or "related products".
- "suggestedTrinityName" is the Trinity-side private-label name. Trinity names US towns/cities: examples already in the catalog are "kendall", "lunett", "oberlin", "torrance". Invent a NEW name in this style — one single lowercase word, evocative of an American place name, that is NOT the factory's product name, NOT any word that appears in the source page, and NOT any of those 4 examples. Two-syllable place names work best. Pick a name with a clearly different first syllable from those examples — names that share a prefix or differ by only a suffix (halden / halvern / halsted) are too easy to confuse.
- "suggestedDescription" must be REWRITTEN in Trinity's voice — NEVER copied or paraphrased verbatim from the factory page (the factory's copy is the factory's brand, not Trinity's). Wherever the product name would appear in the description, write the literal token "{{name}}" (with the curly braces) instead of any name. The token is substituted with the Trinity name at render time, so even if the rep later renames it, the description stays consistent. Reference style: "{{name}} captures the raw elegance of poured concrete with soft gradients, subtle texture, and five refined neutrals." Two short sentences, 30-60 words, commercial-flooring tone, no mention of any factory name.
- Size labels use nominal inches with quote marks, smaller side first: 12"x24", 3"x12", 4"x16", 3"x6" bullnose, 12"x12" mosaic. Never leave a heading like "Wall Tile (Glossy) - 4x16" or a bare "4x16" as the label. Convert explicit cm sizes to the US nominal (40x120cm → 16"x48", 120x278cm → 48"x110"). Do not convert a bare 12x24 — on US factory pages that is already inches.
- The same nominal size in several finishes is ONE size column. Finishes belong in finishLegend / sizes[].finishes, not in the label. "Wall Tile (Glossy) - 3x12" and "Wall Tile (Matte) - 3x12" are a single 3"x12" size offered in glossy and matte.
- "iconKind" picks the icon used on the size chart:
  * "rectangle" → standard rectangular field tile (e.g. 12"x24", 24"x48")
  * "square" → 1:1 tile (e.g. 12"x12", 24"x24", 5"x5")
  * "plank" → narrow tile, including subway / wall field (3"x6", 3"x12", 4"x16", 2.5"x10") and floor planks (6"x24", 8"x48")
  * "mosaic" → mesh sheet of small tiles
  * "bullnose" → trim piece (e.g. 3"x12" bullnose, 3"x24" bullnose). Pull bullnose from the trim / "available trims" table, as its own size, not folded into the field size.
- "isDeco" is true ONLY for the decorative variant of a field size (a grooved / textured deco that matches a color). Put the word "deco" in isDeco, not a second time in the label — label stays 24"x48" with isDeco true. A color named "Halo Ivory Deco" is NOT its own color: set decoImageUrl on Halo Ivory.
- Ceramic wall tile (glossy, silk, matte subway) is still a full size chart. Record every field size and every bullnose or mosaic the page lists, not just the first one. A mesh-mounted mosaic keeps the chip size and the sheet size (4"x4" mosaic mounted on a 12"x12" sheet). If the page says wall / backsplash only, add a footnote "*ceramic wall tile — not for floors". DCOF / ANSI A326.3 listed as N/A means dcof is null — do not invent a wet DCOF for wall tile.
- "availability" maps each color name → the size labels available in that color. Use the normalized inch labels (3"x12", and 3"x12" deco when isDeco). If a color is glossy-only, do not claim the matte finish for it. If unsure, list every size for every color.
- "techSpecs" values must be SHORT and stripped of commentary. Match the Trinity reference brevity exactly. Use the printed units, no extra words. Examples (these are the only patterns; copy them):
  * thickness: "8mm" | "9mm" | "9.5mm" | "6mm - 9.5mm" | "9.5mm | 8.5mm"
  * shadeVariation: "v1" | "v2" | "v3" | "v4" | "v2-v3"
  * waterAbsorption: "≤ 0.5%" | "≤ 0.1%" | "10% – 18%" (ceramic wall tile is often well above 0.5% — record the stated value)
  * frostResistance: "resistant"
  * stainResistance: "resistant" | "class 5"
  * chemicalResistance: "resistant" | "class a"
  * scratchHardness: "7" | "8" (single digit, no "Mohs" prefix)
  * breakingStrength: "≥ 450 lbf" | "≥ 250 lbs"
  * dcof: "≥ 0.42 wet" | "≥ 0.50 wet" | "matte ≥ 0.50 wet | grip ≥ 0.55 wet"
  Use null for any spec not printed in the source. "N/A", "Not Applicable", and a blank cell are null. Never copy specs from a different product or from a typical value for that tile type.
- "finishLegend" is the GLOBAL set of finishes the collection offers (e.g. ["matte"] for a matte-only line, ["glossy", "matte"] for a wall tile, ["matte", "grip"] for matte indoor + grip outdoor). Defaults to ["matte"] if the page doesn't say. Use lowercase names. Recognized canonical names: "matte", "glossy", "silk", "polished", "grip", "textured", "3d", "3d plus". Map vendor synonyms (naturale → matte; lappato → polished; structured/non-slip → grip; brushed → textured). Keep "glossy" and "silk" as their own names on ceramic wall tile — do not collapse silk into matte.
- "sizes[].finishes" is per-size — set it WHEN AND ONLY WHEN a specific size is restricted to a subset of the global finishLegend. Examples: a 20mm "paver" or "outdoor" size is typically grip only → ["grip"]; a "deco" size is typically textured only → ["textured"]; a "polished" or "lappato"-labeled size is polished only. Leave finishes UNSET for sizes that come in every finish the collection offers (the renderer falls back to the global legend). NEVER set finishes to all of finishLegend — that's redundant.
- Be conservative — if data isn't on the page, set the field to null / empty array. Do not invent specs.

ANTI-HALLUCINATION RULES (the most important rules — these override everything else):
- "documentRecognized" MUST be true ONLY if the source clearly shows a real tile / porcelain / ceramic / flooring product with a brand name, a collection name, and at least one color or size visible in the text. Set it to false for: empty pages, login walls, JS-only pages with no readable content, 404 / error pages, garbled / binary content (e.g. a PDF interpreted as HTML), any page that is NOT a tile/flooring product page. If unsure, set false.
- "sourceEvidence" must quote 3–6 SHORT verbatim snippets (5–20 words each) directly from the source — color names, size labels, brand name, or country of origin — that prove what you extracted is real. These must appear LITERALLY in the source text. If you can't find such snippets, set documentRecognized to false and leave the array empty.
- "countryOfOrigin" (used in suggestedTagline): NEVER guess. If "made in <country>" is not LITERALLY stated in the source, leave it out of the tagline entirely. Do not infer from brand name.
- If documentRecognized is false: still call the tool, but set every other field to empty/null. The caller will abort and surface an error to the user instead of saving the product. Never invent a product to fill the schema.`;

const TOOL_SCHEMA = {
  name: "extract_product",
  description:
    "Extracts structured product info from a factory tile product page for the Trinity Surfaces brochure generator.",
  input_schema: {
    type: "object",
    properties: {
      documentRecognized: {
        type: "boolean",
        description:
          "True ONLY if the source clearly shows a real tile/flooring product with brand, collection name, and visible colors or sizes. False for empty pages, error pages, garbled content (e.g. PDF binary parsed as HTML), or anything that is not a tile/flooring product. When false, every other field MUST be empty/null — the caller will abort instead of saving.",
      },
      sourceEvidence: {
        type: "array",
        items: { type: "string" },
        description:
          "3–6 SHORT verbatim snippets (5–20 words each) copied LITERALLY from the source: brand name, collection name, color names, size labels, country of origin. These prove the extraction is grounded. Empty array when documentRecognized is false.",
      },
      factoryName: {
        type: "string",
        description:
          "Product / collection name as printed on the factory site (e.g. 'Forum', 'Moondance', 'Log').",
      },
      suggestedTrinityName: {
        type: "string",
        description:
          "Suggested Trinity-side private-label name. Single lowercase word in the style of an American place name (like Trinity's existing collections kendall, lunett, oberlin, torrance). MUST be different from factoryName.",
      },
      suggestedTagline: {
        type: "string",
        description:
          'Short product descriptor, e.g. "thru color porcelain tile, made in usa" or "glazed porcelain tile, made in italy". Lowercase.',
      },
      suggestedDescription: {
        type: "string",
        description:
          "2 short sentences, 30-60 words, Trinity's voice. Use the literal token \"{{name}}\" wherever the product name would appear — NEVER write the factory's product name. Example: \"{{name}} captures the raw elegance of poured concrete with soft gradients, subtle texture, and five refined neutrals.\"",
      },
      heroImageUrl: {
        type: "string",
        description:
          "Absolute URL of the best lifestyle / room-scene image showing the product installed.",
      },
      colors: {
        type: "array",
        description:
          "All color/finish options offered in this product line, in factory order.",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            imageUrl: {
              type: "string",
              description:
                "Absolute URL to the clean swatch / tile-face image for this color.",
            },
            decoImageUrl: {
              type: ["string", "null"],
              description:
                "If a decorative-finish variant of this color exists on the same page, its image URL. Else null.",
            },
          },
          required: ["name", "imageUrl"],
        },
      },
      sizes: {
        type: "array",
        description: "All available tile sizes/formats for this product.",
        items: {
          type: "object",
          properties: {
            label: {
              type: "string",
              description:
                'Size label exactly as the factory writes it, e.g. \'12"x24"\', \'6"x24"\', \'3"x24" bullnose\'.',
            },
            thickness: {
              type: ["string", "null"],
              description: 'Thickness annotation if shown, e.g. "8mm" or "9.5mm".',
            },
            iconKind: {
              type: "string",
              enum: ["rectangle", "square", "plank", "mosaic", "bullnose"],
            },
            isDeco: { type: ["boolean", "null"] },
            finishes: {
              type: ["array", "null"],
              items: { type: "string" },
              description:
                'OPTIONAL — set only when this size is finish-restricted (e.g. ["grip"] for an outdoor paver, ["textured"] for a deco, ["polished"] for a lappato/polished-only size). Leave null/omitted for sizes that come in the full collection finishLegend.',
            },
          },
          required: ["label", "iconKind"],
        },
      },
      availability: {
        type: "object",
        description:
          "Map from color name → list of size labels available in that color.",
        additionalProperties: { type: "array", items: { type: "string" } },
      },
      techSpecs: {
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
      finishLegend: {
        type: "array",
        items: { type: "string" },
        description:
          'Bullet-point labels for the finish legend, e.g. ["matte"] or ["matte", "textured"].',
      },
      footnotes: {
        type: "array",
        items: { type: "string" },
        description:
          'Any *-prefixed footnotes shown on the brochure-like spec pages, e.g. "*not recommended for floors".',
      },
    },
    required: [
      "documentRecognized",
      "sourceEvidence",
      "factoryName",
      "suggestedTrinityName",
      "suggestedTagline",
      "suggestedDescription",
      "heroImageUrl",
      "colors",
      "sizes",
      "availability",
      "techSpecs",
    ],
  },
} as const;

const MAX_HTML_CHARS = 90_000;

export async function scrapeWithAI(
  url: string,
  cleanedHtml: string,
  pageTitle: string,
  catalog?: PageCatalog | null,
  pageHtml?: string,
): Promise<ScrapedProduct> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not set on the server.");
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const factory = factoryFromUrl(url);
  const truncated = cleanedHtml.slice(0, MAX_HTML_CHARS);
  const truncatedNote =
    cleanedHtml.length > MAX_HTML_CHARS
      ? `\n\n[note: HTML truncated from ${cleanedHtml.length} to ${MAX_HTML_CHARS} chars]`
      : "";

  const host = new URL(url).hostname.replace(/^www\./, "");
  const catalogBlock = catalog ? catalogSummary(catalog) : "";
  const ext = await runExtraction(client, host, [
    {
      type: "text",
      text: `Factory: ${factory?.display ?? new URL(url).host}
URL: ${url}
Page title: ${pageTitle}
${catalogBlock ? `\n${catalogBlock}\n` : ""}
Page HTML (cleaned):
${truncated}${truncatedNote}`,
    },
  ]);

  return finalizeScrapedProduct(
    buildScrapedProduct(ext, {
      factory: factory?.display ?? new URL(url).host,
      factoryUrl: url,
    }),
    { catalog, pageTitle, sourceText: cleanedHtml, pageHtml: pageHtml || cleanedHtml },
  );
}

// PDF-upload counterpart to scrapeWithAI. Used when a factory sends a
// spec sheet for an unreleased product that has no public URL yet.
// Since there's no host, lessons aren't filtered by domain — we pass
// "" and the lessons store returns the top global lessons.
export async function scrapeFromPdfWithAI(
  pdfBytes: ArrayBuffer,
  originalFilename: string,
): Promise<ScrapedProduct> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not set on the server.");
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const base64 = Buffer.from(pdfBytes).toString("base64");

  const ext = await runExtraction(client, "", [
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
      text: `Source: PDF upload (no factory URL — this is an unreleased product spec sheet).
Filename: ${originalFilename}

Extract the same structured product info you'd extract from a factory product page. The factory brand name is in the document — pull it from the cover or header.`,
    },
  ]);

  return finalizeScrapedProduct(
    buildScrapedProduct(ext, {
      factory: ext.factoryName || "(unknown)",
      factoryUrl: "",
    }),
    { sourceText: (ext.sourceEvidence ?? []).join("\n") },
  );
}

type UserContentBlock =
  | { type: "text"; text: string }
  | Anthropic.TextBlockParam;

async function runExtraction(
  client: Anthropic,
  host: string,
  content: UserContentBlock[],
): Promise<ExtractedShape> {
  // Inject the most-relevant lessons reps have already taught us via the
  // /products/[id] edit chat. Same-factory lessons rank highest. This
  // is how the scraper learns over time.
  const lessons = await relevantLessonsForScrape(host).catch(() => []);
  const lessonsBlock =
    lessons.length > 0
      ? `\n\nLearned rules from past rep corrections (apply these going forward):\n${lessons
          .map((l, i) => `${i + 1}. ${l.summary}`)
          .join("\n")}`
      : "";

  // TODO: add prompt caching once we bump @anthropic-ai/sdk past 0.30 —
  // current typings don't accept cache_control on text blocks/tools.
  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    system: SYSTEM_PROMPT + lessonsBlock,
    tools: [TOOL_SCHEMA as unknown as Anthropic.Tool],
    tool_choice: { type: "tool", name: "extract_product" },
    messages: [
      {
        role: "user",
        content: content as unknown as Anthropic.MessageParam["content"],
      },
    ],
  });

  const toolUse = message.content.find((c) => c.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("Claude did not return a tool_use block.");
  }
  const ext = toolUse.input as ExtractedShape;

  // Hard gate — refuse to fabricate. Surfaces a clear error to the rep
  // instead of silently saving a hallucinated product (this was the
  // 2026-05-19 "marlow / made in italy" incident: a PDF URL parsed as
  // HTML returned near-empty content and the AI invented an entire
  // brochure to satisfy the forced tool call).
  if (!ext.documentRecognized) {
    throw new Error(
      "I couldn't recognize a tile/flooring product in the source. " +
        "Common causes: the URL points to a PDF (use Upload PDF instead), " +
        "the page requires JavaScript to render, the page is gated, or it's " +
        "not actually a product page. Try the direct factory product URL or upload the PDF.",
    );
  }
  if (!Array.isArray(ext.sourceEvidence) || ext.sourceEvidence.length < 2) {
    throw new Error(
      "The AI couldn't quote enough source evidence to back up its extraction. " +
        "Refusing to save a possibly-hallucinated product. Try a different URL or upload the PDF.",
    );
  }
  return ext;
}

function buildScrapedProduct(
  ext: ExtractedShape,
  provenance: { factory: string; factoryUrl: string },
): ScrapedProduct {
  return {
    factory: provenance.factory,
    factoryName: ext.factoryName,
    factoryUrl: provenance.factoryUrl,
    suggestedTrinityName: normalizeTrinityName(
      ext.suggestedTrinityName,
      ext.factoryName,
    ),
    suggestedTagline: ext.suggestedTagline ?? "",
    suggestedDescription: ext.suggestedDescription ?? "",
    heroImageUrl: ext.heroImageUrl ?? "",
    colors: (ext.colors ?? []).map((c) => ({
      name: c.name,
      imageUrl: c.imageUrl,
      decoImageUrl: c.decoImageUrl ?? undefined,
    })),
    sizes: (ext.sizes ?? []).map((s) => ({
      label: s.label,
      thickness: s.thickness ?? undefined,
      iconKind: s.iconKind as SizeIcon,
      isDeco: s.isDeco ?? false,
      finishes:
        s.finishes && s.finishes.length > 0
          ? s.finishes.map((f) => f.toLowerCase())
          : undefined,
    })),
    availability: ext.availability ?? {},
    techSpecs: ext.techSpecs ?? {},
    finishLegend:
      ext.finishLegend && ext.finishLegend.length > 0
        ? ext.finishLegend
        : ["matte"],
    footnotes: ext.footnotes ?? [],
  };
}

// Trinity reserves a small set of names (their existing catalog).
// If Claude proposes one of those, fall through to a deterministic
// fallback derived from the factory name.
function normalizeTrinityName(suggested: string | undefined, factoryName: string): string {
  const cleaned = (suggested ?? "")
    .toLowerCase()
    .replace(/[^a-z]/g, "")
    .trim();
  const factoryLower = factoryName.toLowerCase().replace(/\s+/g, "");
  if (
    !cleaned ||
    cleaned === factoryLower ||
    isPlaceholderName(cleaned) ||
    RESERVED_TRINITY_NAMES.has(cleaned)
  ) {
    // Deterministic placeholder so the rep is forced to override it on
    // the preview page rather than silently shipping a duplicate.
    return "";
  }
  return cleaned;
}

interface ExtractedShape {
  documentRecognized?: boolean;
  sourceEvidence?: string[];
  factoryName: string;
  suggestedTrinityName?: string;
  suggestedTagline?: string;
  suggestedDescription?: string;
  heroImageUrl?: string;
  colors?: { name: string; imageUrl: string; decoImageUrl?: string | null }[];
  sizes?: {
    label: string;
    thickness?: string | null;
    iconKind: string;
    isDeco?: boolean | null;
    finishes?: string[] | null;
  }[];
  availability?: Record<string, string[]>;
  techSpecs?: Record<string, string | null>;
  finishLegend?: string[];
  footnotes?: string[];
}
