import type { TechSpecs } from "./scrapers/types";

// Trinity's spec table prints the test method in the gray header with
// the property name. A separate row of codes ("-", "C373", "Mohs")
// reads as a second set of values. Thickness and shade variation have
// no standard, so they must not show a dash.
const COLUMNS: { key: keyof TechSpecs; label: string; standard?: string }[] = [
  { key: "thickness", label: "nominal thickness" },
  { key: "shadeVariation", label: "shade variation" },
  { key: "waterAbsorption", label: "water absorption", standard: "ASTM C373" },
  { key: "frostResistance", label: "frost resistance", standard: "ASTM C1026" },
  { key: "stainResistance", label: "stain resistance", standard: "ASTM C1378" },
  { key: "chemicalResistance", label: "chemical resistance", standard: "ASTM C650" },
  { key: "scratchHardness", label: "scratch hardness", standard: "Mohs" },
  { key: "breakingStrength", label: "breaking strength", standard: "ASTM C648" },
  { key: "dcof", label: "dynamic coefficient of friction", standard: "ANSI A326.3" },
  { key: "slipResistance", label: "slip resistance", standard: "DIN 51130" },
];

export interface TechSpecColumn {
  key: keyof TechSpecs;
  /** Header text. Standards are part of the label, never their own row. */
  header: string;
}

export function techSpecHeader(label: string, standard?: string): string {
  if (!standard || standard === "-") return label;
  return `${label} (${standard})`;
}

export function visibleTechSpecColumns(
  specs: Partial<TechSpecs>,
  standards?: Partial<Record<keyof TechSpecs, string>> | null,
): TechSpecColumn[] {
  return COLUMNS.filter((column) => {
    const value = specs[column.key];
    return value != null && String(value).trim() !== "";
  }).map((column) => ({
    key: column.key,
    header: techSpecHeader(column.label, standards?.[column.key] || column.standard),
  }));
}
