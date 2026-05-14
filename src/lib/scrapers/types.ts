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
