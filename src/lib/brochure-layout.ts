import { DEFAULT_SWATCH_ASPECT } from "./brochure-types";
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
const BODY_TOP_GAP = 12;           // mt-3 below header
const SECTION_GAP = 6;             // space-y-1.5
const MATRIX_HEADER_H = 68;        // sizes h3 (~18) + icon row (~50)
const MATRIX_ROW_H = 22;           // py-1 (8) + text 10 + border-b 1 + cushion
const FOOTNOTES_MAX_H = 16;
const SAFETY_BUFFER = 20;

const SWATCH_LABEL_H = 18;     // mt-1 (4) + text-[11px] line (14)
const SWATCH_ROW_GAP = 8;      // mt-2 between deco rows
const SWATCH_GAP_X = 12;       // gap between swatches in a row

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
}

// Compute the swatch layout: how many primary rows to use and the
// largest swatch (at the product's true aspect ratio) that fits inside
// page 2. We try 1..MAX_ROWS rows and pick the row count that yields the
// largest swatch — that way the grid wraps automatically when there are
// too many colors to fit horizontally at a reasonable size (Bestow case).
//
// `aspect` is height/width: 2 = legacy 12"x24" portrait tile, 1 = square,
// 0.5 = landscape wall tile, 5 = a 2"x10" plank. The ratio is never
// clamped or distorted — taller shapes simply yield narrower swatches.
const MAX_PRIMARY_ROWS = 3;

export function computeSwatchLayout(
  colorCount: number,
  hasDeco: boolean,
  aspect: number = DEFAULT_SWATCH_ASPECT,
): SwatchLayout {
  if (colorCount <= 0) return { width: 0, height: 0, primaryRows: 1, perRow: 0 };
  // Guard against non-positive/NaN aspect from bad data → legacy default.
  const a = aspect > 0 ? aspect : DEFAULT_SWATCH_ASPECT;

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

  let best: SwatchLayout = { width: 0, height: 0, primaryRows: 1, perRow: colorCount };

  for (let primaryRows = 1; primaryRows <= MAX_PRIMARY_ROWS; primaryRows++) {
    const perRow = Math.ceil(colorCount / primaryRows);
    const visualRows = primaryRows * (hasDeco ? 2 : 1);
    const labelArea = visualRows * SWATCH_LABEL_H;
    const rowGapTotal = (visualRows - 1) * SWATCH_ROW_GAP;
    const availImagesV = Math.max(0, availV - labelArea - rowGapTotal);
    const maxImageH = Math.floor(availImagesV / visualRows);

    const maxImageW = Math.floor(
      (CONTENT_W - SWATCH_GAP_X * (perRow - 1)) / perRow,
    );

    // Maintain the true aspect ratio — never distort. height = w * aspect
    // ≤ maxImageH by construction, so the page-2 budget always holds.
    const w = Math.max(0, Math.min(maxImageW, Math.floor(maxImageH / a)));

    if (w > best.width) {
      best = { width: w, height: Math.round(w * a), primaryRows, perRow };
    }
  }

  return best;
}

export function getSwatchLayout(data: BrochureData): SwatchLayout {
  const hasDeco = data.colors.some((c) => c.decoImageUrl);
  return computeSwatchLayout(
    data.colors.length,
    hasDeco,
    data.swatchAspect ?? DEFAULT_SWATCH_ASPECT,
  );
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
