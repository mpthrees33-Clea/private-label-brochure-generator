import type { BrochureData } from "./brochure-types";

// Blocking gate: description, images, colors, and sizes must be present
// before a PDF is saved or downloaded. Technical specifications are a
// warning. Factories often omit them, and marketing can add them in the
// editor. Until four real values are filled, the specs table stays off
// the PDF (or shows only the values that were actually found).

const MIN_TECH_SPECS = 4;

export type MissingField =
  | "description"
  | "tagline"
  | "heroImageUrl"
  | "colors"
  | "color-images"
  | "sizes"
  | "tech-specs";

export function filledTechSpecCount(data: Pick<BrochureData, "techSpecs">): number {
  return Object.values(data.techSpecs ?? {}).filter(
    (v) => v != null && String(v).trim() !== "",
  ).length;
}

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
  return missing;
}

/** Shown in the editor. Does not block download or save. */
export function brochureWarnings(data: BrochureData): MissingField[] {
  if (filledTechSpecCount(data) < MIN_TECH_SPECS) return ["tech-specs"];
  return [];
}

export const MISSING_FIELD_LABELS: Record<MissingField, string> = {
  description: "product description",
  tagline: "tagline",
  heroImageUrl: "hero image",
  colors: "any colors",
  "color-images": "swatch images for one or more colors",
  sizes: "size list",
  "tech-specs": `technical specifications (add at least ${MIN_TECH_SPECS} in Edit fields, or paste a spec-sheet URL)`,
};
