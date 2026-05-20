// Detect the URL pattern across a small set of already-filled swatch
// image URLs, then synthesize candidate URLs for the still-empty colors.
//
// The classic case: rep has scraped a 10-color collection. The AI only
// captured working URLs for 2 of them; the rest are blank or 404. Rather
// than copy-paste each one, we infer the factory's URL pattern from the
// working examples and offer one-click fill for the rest.
//
// Pattern model:  url === prefix + normalize(colorName) + suffix
//
// We try several normalize() candidates because every factory has a
// different file-naming convention. The first normalize() that satisfies
// ALL filled examples wins. If none does, no pattern → no suggestion
// (we'd rather show nothing than guess wrong).

const NORMALIZATIONS: { id: string; fn: (s: string) => string }[] = [
  { id: "lower",        fn: (s) => s.toLowerCase().trim() },
  { id: "lower-hyphen", fn: (s) => s.toLowerCase().trim().replace(/\s+/g, "-") },
  { id: "lower-under",  fn: (s) => s.toLowerCase().trim().replace(/\s+/g, "_") },
  { id: "lower-none",   fn: (s) => s.toLowerCase().trim().replace(/\s+/g, "") },
  { id: "upper",        fn: (s) => s.toUpperCase().trim() },
  { id: "upper-hyphen", fn: (s) => s.toUpperCase().trim().replace(/\s+/g, "-") },
  // Shopify CDNs use this one heavily — e.g. Palm_Canyon_Facet_Scandi_Blue_1600x.jpg
  { id: "title-under",  fn: (s) => s.trim().split(/\s+/).map(titleCase).join("_") },
  { id: "title-hyphen", fn: (s) => s.trim().split(/\s+/).map(titleCase).join("-") },
  { id: "title-none",   fn: (s) => s.trim().split(/\s+/).map(titleCase).join("") },
];

// Query strings (?v=…, ?w=…, signed-URL params) are typically per-image
// cache busters that prevent prefix/suffix matching from working. Strip
// them before matching, and synthesize candidates without them — modern
// CDNs (Shopify, WordPress, etc.) serve the underlying image just fine
// without the query.
function stripQuery(url: string): string {
  const q = url.indexOf("?");
  return q < 0 ? url : url.slice(0, q);
}

function titleCase(w: string): string {
  if (!w) return w;
  return w[0].toUpperCase() + w.slice(1).toLowerCase();
}

export interface SwatchPattern {
  prefix: string;
  suffix: string;
  normalizationId: string;
  normalize: (s: string) => string;
}

export function detectSwatchPattern(
  filled: Array<{ colorName: string; url: string }>,
): SwatchPattern | null {
  // Need at least 2 distinct examples to generalize.
  if (filled.length < 2) return null;
  if (filled.some((f) => !f.url || !f.colorName)) return null;

  // Work on query-stripped URLs throughout. The synthesized candidates
  // are emitted without query strings too — the rep can re-edit if a
  // specific CDN needs them.
  const stripped = filled.map((f) => ({ colorName: f.colorName, url: stripQuery(f.url) }));

  for (const { id, fn: normalize } of NORMALIZATIONS) {
    const first = stripped[0];
    const firstNorm = normalize(first.colorName);
    if (!firstNorm) continue;
    // The color-name token might appear more than once in a URL (CDN path
    // + filename). Iterate every occurrence and accept the first split
    // (prefix, suffix) that holds across ALL filled examples.
    //
    // Two-stage check at each candidate position:
    //   1. Case-INsensitive indexOf to find candidate positions cheaply.
    //   2. Case-SENSITIVE equality check to lock in the right normalization
    //      (e.g. "Cosmos" not "cosmos" for Shopify CDNs that preserve case).
    //      Without this, "lower-under" wins case-insensitively over
    //      "title-under" and emits a 404 prediction.
    const haystack = first.url.toLowerCase();
    const needle = firstNorm.toLowerCase();
    let idx = -1;
    while (true) {
      idx = haystack.indexOf(needle, idx + 1);
      if (idx < 0) break;
      const actualMiddle = first.url.slice(idx, idx + firstNorm.length);
      if (actualMiddle !== firstNorm) continue;
      const prefix = first.url.slice(0, idx);
      const suffix = first.url.slice(idx + firstNorm.length);
      const allMatch = stripped.every(({ colorName, url }) => {
        const n = normalize(colorName);
        return !!n && url === prefix + n + suffix;
      });
      if (allMatch) {
        return { prefix, suffix, normalizationId: id, normalize };
      }
    }
  }
  return null;
}

export function applyPattern(pattern: SwatchPattern, colorName: string): string {
  return pattern.prefix + pattern.normalize(colorName) + pattern.suffix;
}
