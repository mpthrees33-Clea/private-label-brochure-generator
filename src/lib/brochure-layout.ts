import type { BrochureData } from "./brochure-types";

// Letter at 96 DPI: 816 × 1056 px.
export const PAGE_W = 816;
export const PAGE_H = 1056;
export const PAGE_PADDING_X = 48;
export const CONTENT_W = PAGE_W - 2 * PAGE_PADDING_X; // 720

// Fixed page-2 vertical elements, in px. Conservative estimates — better
// to leave a small unused gap than to overflow onto page 3.
const HEADER_H = 122;          // pt-[32px] + h1 64 + mt-1 + tagline
const BODY_TOP_GAP = 12;       // mt-3
const SECTION_GAP = 6;         // space-y-1.5
const SIZE_MATRIX_H = 230;     // typical 5-color matrix with 2-line size labels
const FOOTNOTES_MAX_H = 20;
const BOTTOM_ROW_H = 96;       // tech specs h3 + table OR contact block (whichever taller)
const BOTTOM_PADDING = 36;     // pb-[36px]
const SAFETY_BUFFER = 8;       // round-up cushion vs print-time subpixel layout

const SWATCH_LABEL_H = 18;     // mt-1 (4) + text-[11px] line (14)
const SWATCH_ROW_GAP = 8;      // mt-2 between deco rows
const SWATCH_GAP_X = 12;       // gap between swatches in a row

export interface SwatchLayout {
  width: number;
  height: number;
  /** Number of PRIMARY rows. If hasDeco, total visual rows = primaryRows * 2. */
  primaryRows: number;
  /** Colors per primary row (last row may have fewer). */
  perRow: number;
}

// Compute the swatch layout: how many primary rows to use and the
// largest 1:2 swatch that fits inside page 2. We try 1..MAX_ROWS rows
// and pick the row count that yields the largest swatch — that way the
// grid wraps automatically when there are too many colors to fit
// horizontally at a reasonable size (Bestow case).
const MAX_PRIMARY_ROWS = 3;

export function computeSwatchLayout(
  colorCount: number,
  hasDeco: boolean,
): SwatchLayout {
  if (colorCount <= 0) return { width: 0, height: 0, primaryRows: 1, perRow: 0 };

  const sectionGaps = 2; // swatches→matrix, matrix→footnotes
  const fixedV =
    HEADER_H +
    BODY_TOP_GAP +
    SECTION_GAP * sectionGaps +
    SIZE_MATRIX_H +
    FOOTNOTES_MAX_H +
    BOTTOM_ROW_H +
    BOTTOM_PADDING +
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

    // Maintain 1:2 ratio — never distort.
    const w = Math.max(0, Math.min(maxImageW, Math.floor(maxImageH / 2)));

    if (w > best.width) {
      best = { width: w, height: w * 2, primaryRows, perRow };
    }
  }

  return best;
}

export function getSwatchLayout(data: BrochureData): SwatchLayout {
  const hasDeco = data.colors.some((c) => c.decoImageUrl);
  return computeSwatchLayout(data.colors.length, hasDeco);
}
