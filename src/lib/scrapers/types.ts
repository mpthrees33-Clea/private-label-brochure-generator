export type SizeIcon =
  | "rectangle"
  | "square"
  | "plank"
  | "mosaic"
  | "bullnose";

export interface TechSpecs {
  thickness?: string;
  shadeVariation?: string;
  waterAbsorption?: string;
  frostResistance?: string;
  stainResistance?: string;
  chemicalResistance?: string;
  scratchHardness?: string;
  breakingStrength?: string;
  dcof?: string;
}

export interface ScrapedColor {
  name: string;
  imageUrl: string;
  decoImageUrl?: string;
}

export interface ScrapedSize {
  label: string;
  thickness?: string;
  iconKind: SizeIcon;
  isDeco?: boolean;
  /** Nominal face dimensions in inches, parsed from the label when the
   *  label has them (e.g. '2"x10"' → widthIn 2, heightIn 10). Omitted for
   *  mosaics, trim, or labels with no parseable face dims. Used to derive
   *  the representative swatch aspect ratio. */
  widthIn?: number;
  heightIn?: number;
  /** Finishes this specific size column comes in (e.g. ["matte"] or
   *  ["grip"] for an outdoor paver). When unset, the chart renderer
   *  falls back to the global finishLegend. */
  finishes?: string[];
}

export interface ScrapedProduct {
  factory: string;
  factoryName: string;
  factoryUrl: string;
  /** Single-word Trinity-style private-label name suggested by the AI. */
  suggestedTrinityName: string;
  suggestedTagline: string;
  suggestedDescription: string;
  heroImageUrl: string;
  colors: ScrapedColor[];
  sizes: ScrapedSize[];
  availability: Record<string, string[]>;
  techSpecs: Partial<TechSpecs>;
  finishLegend: string[];
  footnotes: string[];
  /** Representative swatch box aspect (height / width) derived from the
   *  product's field tile. Undefined when no size has parseable dims —
   *  the renderer then falls back to the legacy 1:2 portrait tile. */
  swatchAspect?: number;
}

export interface FactoryAdapter {
  matches(url: string): boolean;
  scrape(url: string): Promise<ScrapedProduct>;
}
