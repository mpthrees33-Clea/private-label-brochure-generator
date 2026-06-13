// Domain types used by the brochure renderer.
// Decouples the HTML view from the Prisma row shape so we can
// preview unsaved scrapes without persisting.

import type { SizeIcon, TechSpecs } from "./scrapers/types";

export type { SizeIcon, TechSpecs };

export interface BrochureColor {
  trinityName: string;
  imageUrl: string;
  decoImageUrl?: string | null;
}

export interface BrochureSize {
  label: string;          // e.g. '12"x24"'
  thickness?: string | null; // e.g. '8.5mm'
  iconKind: SizeIcon;
  isDeco?: boolean;
  footnoteRef?: string | null;
  /** Finishes this size column comes in. Overrides the global
   *  finishLegend for chart-marker rendering when set. Used when a
   *  size is finish-restricted — e.g. Lunett's 24"x48" paver is grip
   *  only, Torrance's 12"x24" deco is textured only. When unset, the
   *  size inherits the global finishLegend. */
  finishes?: string[];
}

export interface BrochureData {
  trinityName: string;
  trinityTagline: string;
  description: string;
  heroImageUrl: string;
  colors: BrochureColor[];
  sizes: BrochureSize[];
  /** Map of color trinityName → list of size labels that are available */
  availability: Record<string, string[]>;
  /** Legend bullets shown next to the sizes matrix, e.g. ["matte", "textured"] */
  finishLegend: string[];
  /** Optional footnotes shown under the sizes matrix */
  footnotes: string[];
  techSpecs: Partial<TechSpecs>;
  /** Representative swatch box aspect = height / width. 2 = legacy 1:2
   *  portrait tile (12"x24"), 1 = square (6"x6"), 0.5 = 2:1 landscape wall
   *  tile (12"x6"), 5 = a 2"x10" plank. Undefined → DEFAULT_SWATCH_ASPECT.
   *  The true ratio is always preserved — the layout engine scales the
   *  swatch down to fit, it never stretches the shape. */
  swatchAspect?: number;
  /** Per-block manual position overrides set by the rep in the
   *  drag-to-position editor. Missing keys use the layout defaults. */
  layoutOverrides?: LayoutOverrides;
}

/** Default swatch aspect (height/width) when a product has no parsed
 *  field-tile dimensions. Matches the legacy 12"x24" portrait tile. */
export const DEFAULT_SWATCH_ASPECT = 2;

/** Identifiers for every block the rep can reposition on the brochure. */
export type BlockId =
  | "hero"
  | "description"
  | "swatches"
  | "sizeMatrix"
  | "techSpecs"
  | "contact";

/** Override coordinates are page-relative pixels at 96 DPI (Letter = 816×1056). */
export interface BlockPosition {
  x: number;
  y: number;
}

export type LayoutOverrides = Partial<Record<BlockId, BlockPosition>>;
