import type { BrochureData } from "./brochure-types";
import type { ScrapedProduct } from "./scrapers/types";

// Convert a freshly-scraped product (factory naming) into the brochure
// renderer's data shape. Currently maps factoryName → trinityName 1:1;
// the rep can rename it on the edit page when CRUD lands. All names
// lowercase to match Trinity's brand style.
export function scrapedToBrochure(p: ScrapedProduct): BrochureData {
  return {
    trinityName: p.factoryName.toLowerCase(),
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
      footnoteRef: null,
    })),
    availability: lowercaseKeys(p.availability),
    finishLegend: p.finishLegend,
    footnotes: p.footnotes,
    techSpecs: p.techSpecs,
  };
}

function lowercaseKeys(
  o: Record<string, string[]>,
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(o)) out[k.toLowerCase()] = v;
  return out;
}
