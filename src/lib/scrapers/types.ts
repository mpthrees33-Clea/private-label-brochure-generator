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
  /** Nominal mesh sheet, e.g. 12"x12", for a mosaic chip. */
  sheetLabel?: string;
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
  /** color (lowercase) → size chart label → finishes actually offered.
   *  Set when a color doesn't come in every finish of that size
   *  (cream subway is glossy only; white is glossy and matte). */
  availabilityFinishes?: Record<string, Record<string, string[]>>;
  techSpecs: Partial<TechSpecs>;
  /** Test method printed next to each value. */
  specStandards?: Partial<Record<keyof TechSpecs, string>>;
  /** Document URL each value was read from. */
  specSources?: Partial<Record<keyof TechSpecs, string>>;
  /** Trims and named decors shown as one line under the size chart. */
  specialPieces?: string[];
  finishLegend: string[];
  footnotes: string[];
}

export interface FactoryAdapter {
  matches(url: string): boolean;
  scrape(url: string): Promise<ScrapedProduct>;
}
