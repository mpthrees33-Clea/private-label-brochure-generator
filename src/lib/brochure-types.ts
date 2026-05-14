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
}
