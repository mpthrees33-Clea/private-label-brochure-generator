import type { BrochureData } from "./brochure-types";

// Quality gate: every brochure must have these fields populated before
// the rep is allowed to save. The user has been explicit — half-baked
// brochures are worse than no brochure. Surface what's missing on the
// preview, block Save until resolved.

const MIN_TECH_SPECS = 4;

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

export const MISSING_FIELD_LABELS: Record<MissingField, string> = {
  description: "product description",
  tagline: "tagline",
  heroImageUrl: "hero image",
  colors: "any colors",
  "color-images": "swatch images for one or more colors",
  sizes: "size list",
  "tech-specs": `technical specifications (need at least ${MIN_TECH_SPECS} filled)`,
};
