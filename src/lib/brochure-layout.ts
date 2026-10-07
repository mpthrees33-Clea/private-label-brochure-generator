import type { BlockId, BrochureData } from "./brochure-types";
import { resolveSwatchFaces } from "./swatch-geometry";

// Letter at 96 DPI: 816 × 1056 px.
export const PAGE_W = 816;
export const PAGE_H = 1056;
export const PAGE_PADDING_X = 48;
export const CONTENT_W = PAGE_W - 2 * PAGE_PADDING_X; // 720

// Page-2 vertical geometry. The bottom row (tech specs + QR) is now
// pinned to the bottom edge with absolute positioning at exactly
// BOTTOM_BLOCK_H tall. The middle content area (swatches + matrix) is
// clipped to fit between header and bottom row — overflow never reaches
// the tech-specs row, which is the bulletproof guarantee the rep asked
// for.
export const HEADER_H = 100;       // pt-[20px] + h1 56*0.95 + mt-1 + tagline
export const BOTTOM_BLOCK_H = 168; // fixed bottom-row height (tech specs + contact + padding)
const BODY_TOP_GAP = 12;           // gap below the header before swatches
const SECTION_GAP = 8;             // gap between swatch block and size chart
const MATRIX_HEADER_H = 68;        // sizes h3 (~18) + icon row (~50)
const MATRIX_ROW_H = 22;           // py-1 (8) + text 10 + border-b 1 + cushion
const FOOTNOTES_MAX_H = 52;
const SAFETY_BUFFER = 20;

const SWATCH_LABEL_H = 22;     // mt-1 (4) + one 11px line
const SWATCH_LABEL_H_2 = 32;   // two wrapped lines, clamped so they cannot hit the chart
const SWATCH_ROW_GAP = 8;      // gap between swatch rows (and field→deco)
const SWATCH_GAP_X = 12;       // gap between swatches in a row
const PAGE2_TOP = HEADER_H + BODY_TOP_GAP;
// A single row of width-capped 1:2 swatches (typical wall tile, 3–4
// colors) ends high on the page and leaves a large empty band between
// the size chart and the pinned tech-spec row. Prefer an extra row of
// slightly smaller swatches when that band would exceed this.
const MAX_VOID_ABOVE_SPECS = 96;
const MIN_SWATCH_W = 64;

function estimateSizeMatrixHeight(colorCount: number): number {
  return MATRIX_HEADER_H + colorCount * MATRIX_ROW_H;
}

export interface SwatchLayout {
  /** Shared column width for one color. Each face height is width / ratio. */
  width: number;
  /** Height of the first face. Kept so a 12×24 tile is still twice as tall as it is wide. */
  height: number;
  /** Number of color-group rows. Faces stack inside each color. */
  primaryRows: number;
  /** Colors per primary row (last row may have fewer). */
  perRow: number;
  hasDeco: boolean;
  /** Reserved caption height, including the 4px gap above the text. */
  labelHeight: number;
  /** width/height of each face in a color, top to bottom. */
  faceRatios: number[];
}

export function swatchBlockHeight(layout: SwatchLayout): number {
  if (layout.width <= 0 || layout.perRow <= 0) return 0;
  const ratios = layout.faceRatios.length > 0 ? layout.faceRatios : [1];
  const labelH = layout.labelHeight || SWATCH_LABEL_H;
  const imageStack = ratios.reduce((sum, ratio) => sum + layout.width / Math.max(ratio, 0.08), 0);
  const innerGaps = Math.max(0, ratios.length - 1) * SWATCH_ROW_GAP;
  const groupH = imageStack + ratios.length * labelH + innerGaps;
  return (
    layout.primaryRows * groupH +
    Math.max(0, layout.primaryRows - 1) * SWATCH_ROW_GAP
  );
}

/** Page-relative y of the size chart, sitting just under the swatches. */
export function sizeMatrixTop(layout: SwatchLayout): number {
  return PAGE2_TOP + swatchBlockHeight(layout) + SECTION_GAP;
}

// Compute the swatch layout: how many color rows to use and the largest
// slot that still leaves the size chart just above the pinned tech-spec
// row. Each face keeps the tile's own aspect (square, plank, 12×24).
// A single row of a few colors is width-capped and can leave a hole
// under the chart; another row of slightly smaller tiles fills it.
const MAX_PRIMARY_ROWS = 3;

/** How many caption lines a color name needs at this swatch width. Capped at 2. */
export function swatchLabelLines(name: string, width: number): number {
  const perLine = Math.max(1, Math.floor(width / 6.1));
  return Math.min(2, Math.max(1, Math.ceil(name.trim().length / perLine)));
}

export function computeSwatchLayout(
  colorCount: number,
  hasDeco: boolean,
  names: string[] = [],
  faceRatios?: number[][],
): SwatchLayout {
  const ratiosFor = (index: number): number[] => {
    const custom = faceRatios?.[index];
    if (custom && custom.length > 0) return custom.map((ratio) => clampRatio(ratio));
    // No nominal size was passed. Do not invent the old 12×24 frame.
    return [1];
  };
  const stackFactor = (ratios: number[]) =>
    ratios.reduce((sum, ratio) => sum + 1 / Math.max(ratio, 0.08), 0);

  if (colorCount <= 0) {
    return {
      width: 0,
      height: 0,
      primaryRows: 1,
      perRow: 0,
      hasDeco,
      labelHeight: SWATCH_LABEL_H,
      faceRatios: ratiosFor(0),
    };
  }

  const sectionGaps = 2; // swatches→matrix, matrix→footnotes
  const sizeMatrixH = estimateSizeMatrixHeight(colorCount);
  const fixedV =
    HEADER_H +
    BODY_TOP_GAP +
    SECTION_GAP * sectionGaps +
    sizeMatrixH +
    FOOTNOTES_MAX_H +
    BOTTOM_BLOCK_H +
    SAFETY_BUFFER;
  const availV = PAGE_H - fixedV;
  const specsTop = PAGE_H - BOTTOM_BLOCK_H;

  const pick = (labelHeight: number): SwatchLayout => {
    const candidates: SwatchLayout[] = [];
    const seenRows = new Set<number>();
    let factor = 0;
    let tallest = ratiosFor(0);
    for (let i = 0; i < colorCount; i++) {
      const ratios = ratiosFor(i);
      const next = stackFactor(ratios);
      if (next > factor) {
        factor = next;
        tallest = ratios;
      }
    }
    const faceCount = tallest.length;
    for (let requested = 1; requested <= MAX_PRIMARY_ROWS; requested++) {
      const perRow = Math.ceil(colorCount / requested);
      const primaryRows = Math.ceil(colorCount / perRow);
      if (seenRows.has(primaryRows)) continue;
      seenRows.add(primaryRows);

      const innerGaps = Math.max(0, faceCount - 1) * SWATCH_ROW_GAP;
      const groupChrome = faceCount * labelHeight + innerGaps;
      const rowGaps = Math.max(0, primaryRows - 1) * SWATCH_ROW_GAP;
      const availImagesV = Math.max(0, availV - primaryRows * groupChrome - rowGaps);
      const widthFromH = Math.floor(availImagesV / (primaryRows * factor));
      const maxImageW = Math.floor(
        (CONTENT_W - SWATCH_GAP_X * Math.max(0, perRow - 1)) / perRow,
      );
      const w = Math.max(0, Math.min(maxImageW, widthFromH));
      const firstRatio = ratiosFor(0)[0] || 1;
      candidates.push({
        width: w,
        height: Math.round(w / firstRatio),
        primaryRows,
        perRow,
        hasDeco,
        labelHeight,
        faceRatios: tallest,
      });
    }

    const voidBelow = (layout: SwatchLayout) =>
      specsTop - (sizeMatrixTop(layout) + sizeMatrixH + FOOTNOTES_MAX_H);

    const usable = candidates.filter(
      (layout) => layout.width >= MIN_SWATCH_W && voidBelow(layout) >= 8,
    );
    const tight = usable.filter((layout) => voidBelow(layout) <= MAX_VOID_ABOVE_SPECS);
    const pool = tight.length > 0 ? tight : usable.length > 0 ? usable : candidates;
    pool.sort((a, b) => b.width - a.width || a.primaryRows - b.primaryRows);
    return pool[0];
  };

  const single = pick(SWATCH_LABEL_H);
  const wraps = names.some((name) => swatchLabelLines(name, single.width) > 1);
  return wraps ? pick(SWATCH_LABEL_H_2) : single;
}

function clampRatio(ratio: number): number {
  if (!Number.isFinite(ratio) || ratio <= 0) return 1;
  return Math.min(8, Math.max(0.12, ratio));
}

export function getSwatchLayout(data: BrochureData): SwatchLayout {
  const resolved = data.colors.map((color) => resolveSwatchFaces(color, data.sizes));
  const ratios = resolved.map((faces) => faces.map((face) => face.ratio));
  const hasDeco = resolved.some((faces) => faces.some((face) => /\bdeco\b/i.test(face.caption)));
  const names = resolved.flatMap((faces) => faces.map((face) => face.caption));
  return computeSwatchLayout(data.colors.length, hasDeco, names, ratios);
}

/** Default page-relative coords for every draggable block. Page is which
 *  brochure page (1 = cover, 2 = specs). Width is locked per block — the
 *  drag editor only repositions, never resizes.
 *
 *  These numbers reproduce the original flow layout exactly. If you change
 *  one, regenerate a reference PDF and diff against the Kendall/Torrance
 *  PDFs before merging. */
export const BLOCK_DEFAULTS: Record<
  BlockId,
  { page: 1 | 2; x: number; y: number; width: number }
> = {
  // Page 1: hero — sits ~16px below the header (HEADER_H=100) and spans
  // the content width. Aspect-ratio 19:20 → height = CONTENT_W * 20/19 ≈ 758.
  // Y is independently movable so the rep can nudge it up/down a bit.
  hero:        { page: 1, x: PAGE_PADDING_X, y: HEADER_H + 16, width: CONTENT_W },
  // Page 1: hero ends around y=874 (HEADER_H 100 + mt-4 16 + 720*20/19 ≈ 758).
  description: { page: 1, x: PAGE_PADDING_X, y: 890, width: CONTENT_W },
  // Page 2: swatches sit just below the header.
  swatches:    { page: 2, x: PAGE_PADDING_X, y: HEADER_H + 12, width: CONTENT_W },
  // sizeMatrix's default y is computed from the swatch layout — see
  // resolveBlockPosition() in Brochure.tsx. This static fallback is only
  // used when no swatch layout is available.
  sizeMatrix:  { page: 2, x: PAGE_PADDING_X, y: 600, width: CONTENT_W },
  // Bottom row pinned at PAGE_H - BOTTOM_BLOCK_H (888), padded 28 from
  // the page bottom. Tech specs takes the left portion, contact the right.
  techSpecs:   { page: 2, x: PAGE_PADDING_X, y: PAGE_H - BOTTOM_BLOCK_H, width: 524 },
  contact:     { page: 2, x: PAGE_W - PAGE_PADDING_X - 172, y: PAGE_H - BOTTOM_BLOCK_H, width: 172 },
};
