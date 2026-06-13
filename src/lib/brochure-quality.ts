import type { BrochureData } from "./brochure-types";
import { getSwatchLayout } from "./brochure-layout";

// Quality gate: every brochure must have these fields populated before
// the rep is allowed to save. The user has been explicit — half-baked
// brochures are worse than no brochure. Surface what's missing on the
// preview, block Save until resolved.

const MIN_TECH_SPECS = 4;

// Below this rendered swatch width (px at 96 DPI) the color label and tile
// face get too small to read. Reached only at extreme tile ratios (e.g. a
// 2"x10" plank) combined with many colors. This is advisory ONLY — we keep
// the true ratio and never block on it (the 2-page invariant still holds).
const MIN_READABLE_SWATCH_W = 26;

export type MissingField =
  | "description"
  | "tagline"
  | "heroImageUrl"
  | "colors"
  | "color-images"
  | "sizes"
  | "tech-specs";

export function missingBrochureFields(data: BrochureData): MissingField[] {
  const missing: MissingField[] = [];
  if (!data.description || data.description.trim().length < 30) {
    missing.push("description");
  }
  if (!data.trinityTagline || data.trinityTagline.trim().length === 0) {
    missing.push("tagline");
  }
  if (!data.heroImageUrl || data.heroImageUrl.trim().length === 0) {
    missing.push("heroImageUrl");
  }
  if (!data.colors || data.colors.length === 0) {
    missing.push("colors");
  } else if (data.colors.some((c) => !c.imageUrl || c.imageUrl.trim() === "")) {
    missing.push("color-images");
  }
  if (!data.sizes || data.sizes.length === 0) {
    missing.push("sizes");
  }
  const specCount = Object.values(data.techSpecs ?? {}).filter(
    (v) => v != null && String(v).trim() !== "",
  ).length;
  if (specCount < MIN_TECH_SPECS) {
    missing.push("tech-specs");
  }
  return missing;
}

// Non-blocking warnings. Unlike MissingField, these do NOT disable Save /
// Download — they just nudge the rep that the result may look cramped, so
// they can pick a different representative size or drop a color.
export function brochureAdvisories(data: BrochureData): string[] {
  const advisories: string[] = [];
  const swatch = getSwatchLayout(data);
  if (
    data.colors.length > 0 &&
    swatch.width > 0 &&
    swatch.width < MIN_READABLE_SWATCH_W
  ) {
    advisories.push(
      `The swatches are rendering narrow (${swatch.width}px) because this tile shape is tall and the collection has ${data.colors.length} colors. The brochure is still valid, but consider a wider representative size or fewer colors for legibility.`,
    );
  }
  return advisories;
}

export const MISSING_FIELD_LABELS: Record<MissingField, string> = {
  description: "product description",
  tagline: "tagline",
  heroImageUrl: "hero image",
  colors: "any colors",
  "color-images": "swatch images for one or more colors",
  sizes: "size list",
  "tech-specs": `technical specifications (need at least ${MIN_TECH_SPECS} filled)`,
};
