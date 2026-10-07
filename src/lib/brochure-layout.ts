import type { BlockId, BrochureData } from "./brochure-types";

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
const FOOTNOTES_MAX_H = 16;
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
const MIN_SWATCH_W = 72;

function estimateSizeMatrixHeight(colorCount: number): number {
  return MATRIX_HEADER_H + colorCount * MATRIX_ROW_H;
}

export interface SwatchLayout {
  width: number;
  height: number;
  /** Number of PRIMARY rows. If hasDeco, total visual rows = primaryRows * 2. */
  primaryRows: number;
  /** Colors per primary row (last row may have fewer). */
  perRow: number;
  hasDeco: boolean;
  /** Reserved caption height, including the 4px gap above the text. */
  labelHeight: number;
}

export function swatchBlockHeight(layout: SwatchLayout): number {
  if (layout.width <= 0 || layout.perRow <= 0) return 0;
  const visualRows = layout.primaryRows * (layout.hasDeco ? 2 : 1);
  const labelH = layout.labelHeight || SWATCH_LABEL_H;
  return (
    visualRows * (layout.height + labelH) +
    Math.max(0, visualRows - 1) * SWATCH_ROW_GAP
  );
}

/** Page-relative y of the size chart, sitting just under the swatches. */
export function sizeMatrixTop(layout: SwatchLayout): number {
  return PAGE2_TOP + swatchBlockHeight(layout) + SECTION_GAP;
}

// Compute the swatch layout: how many primary rows to use and the
// largest 1:2 swatch that still leaves the size chart just above the
// pinned tech-spec row. A single row of a few wall-tile colors is
// width-capped, so the largest swatch would sit high on the page and
// leave a hole under the chart. In that case we take another row of
// slightly smaller tiles. Very wide color lines still wrap because a
// single row would make the tiles too narrow (Bestow).
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
): SwatchLayout {
  if (colorCount <= 0) {
    return { width: 0, height: 0, primaryRows: 1, perRow: 0, hasDeco, labelHeight: SWATCH_LABEL_H };
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
    for (let requested = 1; requested <= MAX_PRIMARY_ROWS; requested++) {
      const perRow = Math.ceil(colorCount / requested);
      const primaryRows = Math.ceil(colorCount / perRow);
      if (seenRows.has(primaryRows)) continue;
      seenRows.add(primaryRows);

      const visualRows = primaryRows * (hasDeco ? 2 : 1);
      const labelArea = visualRows * labelHeight;
      const rowGapTotal = Math.max(0, visualRows - 1) * SWATCH_ROW_GAP;
      const availImagesV = Math.max(0, availV - labelArea - rowGapTotal);
      const maxImageH = Math.floor(availImagesV / visualRows);
      const maxImageW = Math.floor(
        (CONTENT_W - SWATCH_GAP_X * Math.max(0, perRow - 1)) / perRow,
      );
      // Maintain 1:2 ratio — never distort.
      const w = Math.max(0, Math.min(maxImageW, Math.floor(maxImageH / 2)));
      candidates.push({
        width: w,
        height: w * 2,
        primaryRows,
        perRow,
        hasDeco,
        labelHeight,
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

export function getSwatchLayout(data: BrochureData): SwatchLayout {
  const hasDeco = data.colors.some((c) => !!c.decoImageUrl && c.decoImageUrl.trim() !== "");
  const names = data.colors.map((color) =>
    hasDeco && color.decoImageUrl ? `${color.trinityName} deco` : color.trinityName,
  );
  return computeSwatchLayout(data.colors.length, hasDeco, names);
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
