import Anthropic from "@anthropic-ai/sdk";
import type { ScrapedProduct, SizeIcon } from "./types";
import { factoryFromUrl } from "../factories";
import { relevantLessonsForScrape } from "../store/lessons";

const SYSTEM_PROMPT = `You extract structured tile / flooring product info from factory product pages for the Trinity Surfaces private-label brochure generator.

Return your answer by calling the extract_product tool exactly once. Do not include any other text.

Rules:
- Use absolute image URLs (https://...). Pick the cleanest swatch images for "imageUrl" — ideally the standalone color/finish tile photo, not a lifestyle scene.
- "heroImageUrl" is the best single lifestyle / room-scene image showing the product installed.
- product name / color names should be reproduced as-is from the factory page (we'll lowercase them downstream).
- "suggestedTrinityName" is the Trinity-side private-label name. Trinity names US towns/cities: examples already in the catalog are "kendall", "lunett", "oberlin", "torrance". Invent a NEW name in this style — one single lowercase word, evocative of an American place name, that is NOT the factory's product name and NOT any of those 4 examples. Two-syllable place names work best.
- "iconKind" picks the icon used on the size chart:
  * "rectangle" → standard rectangular field tile (e.g. 12"x24", 24"x48")
  * "square" → 1:1 tile (e.g. 12"x12", 24"x24")
  * "plank" → narrow tall rectangle (e.g. 6"x24", 8"x48")
  * "mosaic" → mesh sheet of small tiles
  * "bullnose" → long skinny trim piece (e.g. 3"x24" bullnose)
- "isDeco" is true for the decorative / textured variant of a standard size.
- "availability" maps each color name → the size labels available in that color. If unsure, list every size for every color.
- "techSpecs" values must be SHORT and stripped of commentary. Match the Trinity reference brevity exactly. Use the printed units, no extra words. Examples (these are the only patterns; copy them):
  * thickness: "8mm" | "9mm" | "9.5mm" | "6mm - 9.5mm" | "9.5mm | 8.5mm"
  * shadeVariation: "v1" | "v2" | "v3" | "v4" | "v2-v3"
  * waterAbsorption: "≤ 0.5%" | "≤ 0.1%"
  * frostResistance: "resistant"
  * stainResistance: "resistant" | "class 5"
  * chemicalResistance: "resistant" | "class a"
  * scratchHardness: "7" | "8" (single digit, no "Mohs" prefix)
  * breakingStrength: "≥ 450 lbf" | "≥ 250 lbs"
  * dcof: "≥ 0.42 wet" | "≥ 0.50 wet" | "matte ≥ 0.50 wet | grip ≥ 0.55 wet"
  Use null for any spec not stated. NEVER add prose like "select sizes" or "(IW+)" — keep it terse.
- "finishLegend" defaults to ["matte"] if not specified. Use ["matte", "textured"] etc. if the page mentions multiple finishes.
- Be conservative — if data isn't on the page, set the field to null / empty array. Do not invent specs.`;

const TOOL_SCHEMA = {
  name: "extract_product",
  description:
    "Extracts structured product info from a factory tile product page for the Trinity Surfaces brochure generator.",
  input_schema: {
    type: "object",
    properties: {
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
        description: "2–3 sentence marketing paragraph describing the product.",
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

  // Inject the most-relevant lessons reps have already taught us via the
  // /products/[id] edit chat. Same-factory lessons rank highest. This
  // is how the scraper learns over time.
  const host = new URL(url).hostname.replace(/^www\./, "");
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
        content: `Factory: ${factory?.display ?? new URL(url).host}
URL: ${url}
Page title: ${pageTitle}

Page HTML (cleaned):
${truncated}${truncatedNote}`,
      },
    ],
  });

  const toolUse = message.content.find((c) => c.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("Claude did not return a tool_use block.");
  }

  const ext = toolUse.input as ExtractedShape;
  return {
    factory: factory?.display ?? new URL(url).host,
    factoryName: ext.factoryName,
    factoryUrl: url,
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
const RESERVED_TRINITY_NAMES = new Set([
  "kendall",
  "lunett",
  "oberlin",
  "torrance",
]);

function normalizeTrinityName(suggested: string | undefined, factoryName: string): string {
  const cleaned = (suggested ?? "")
    .toLowerCase()
    .replace(/[^a-z]/g, "")
    .trim();
  const factoryLower = factoryName.toLowerCase().replace(/\s+/g, "");
  if (!cleaned || cleaned === factoryLower || RESERVED_TRINITY_NAMES.has(cleaned)) {
    // Deterministic placeholder so the rep is forced to override it on
    // the preview page rather than silently shipping a duplicate.
    return "";
  }
  return cleaned;
}

interface ExtractedShape {
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
  }[];
  availability?: Record<string, string[]>;
  techSpecs?: Record<string, string | null>;
  finishLegend?: string[];
  footnotes?: string[];
}
