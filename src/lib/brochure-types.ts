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
  /** color → size chart label → finishes for that cell. Overrides the
   *  size-level finish list when a color is missing a finish. */
  availabilityFinishes?: Record<string, Record<string, string[]>>;
  /** Legend bullets shown next to the sizes matrix, e.g. ["matte", "textured"] */
  finishLegend: string[];
  /** Optional footnotes shown under the sizes matrix */
  footnotes: string[];
  techSpecs: Partial<TechSpecs>;
  /** Per-block manual position overrides set by the rep in the
   *  drag-to-position editor. Missing keys use the layout defaults. */
  layoutOverrides?: LayoutOverrides;
}

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
