export type SizeIcon =
  | "rectangle"
  | "square"
  | "plank"
  | "mosaic"
  | "mosaic-penny"
  | "mosaic-stacked"
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
  /** Swatch box width ÷ height. Unset = 0.5 (portrait 12"x24" field
   *  tile). 1 = square mosaic sheet (12"x12"). Derived from the nominal
   *  sheet/tile size, not the photo's pixel dimensions. */
  swatchAspect?: number;
  /** Format grouping key for multi-format collections (e.g. "squares",
   *  "penny round", "stacked"). Colors sharing a rowGroup render as one
   *  swatch row-band per format on the brochure. */
  rowGroup?: string;
}

export interface ScrapedSize {
  label: string;
  thickness?: string;
  iconKind: SizeIcon;
  isDeco?: boolean;
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
}

export interface FactoryAdapter {
  matches(url: string): boolean;
  scrape(url: string): Promise<ScrapedProduct>;
}
