import type { BrochureData } from "./brochure-types";
import type { ScrapedProduct } from "./scrapers/types";

// Convert a freshly-scraped product into the brochure renderer's data
// shape. The Trinity private-label name comes from the AI's suggestion,
// NOT the factory name — that's the whole point of this product. The
// rep can override the name on the preview page before saving.
export function scrapedToBrochure(
  p: ScrapedProduct,
  trinityNameOverride?: string,
): BrochureData {
  return {
    trinityName: (trinityNameOverride || p.suggestedTrinityName || "").toLowerCase(),
    trinityTagline: p.suggestedTagline,
    description: p.suggestedDescription,
    heroImageUrl: p.heroImageUrl,
    colors: p.colors.map((c) => ({
      trinityName: c.name.toLowerCase(),
      imageUrl: c.imageUrl,
      decoImageUrl: c.decoImageUrl ?? null,
    })),
    sizes: p.sizes.map((s) => ({
      label: s.label,
      thickness: s.thickness ?? null,
      iconKind: s.iconKind,
      isDeco: s.isDeco ?? false,
      sheetLabel: s.sheetLabel ?? null,
      footnoteRef: null,
      finishes: s.finishes,
    })),
    availability: lowercaseKeys(p.availability),
    availabilityFinishes: lowercaseFinishMap(p.availabilityFinishes),
    finishLegend: p.finishLegend,
    footnotes: p.footnotes,
    specialPieces: p.specialPieces,
    techSpecs: p.techSpecs,
    specStandards: p.specStandards,
    specSources: p.specSources,
  };
}

function lowercaseKeys(
  o: Record<string, string[]>,
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(o)) out[k.toLowerCase()] = v;
  return out;
}

function lowercaseFinishMap(
  o: Record<string, Record<string, string[]>> | undefined,
): Record<string, Record<string, string[]>> | undefined {
  if (!o) return undefined;
  const out: Record<string, Record<string, string[]>> = {};
  for (const [color, sizes] of Object.entries(o)) {
    out[color.toLowerCase()] = sizes;
  }
  return out;
}
