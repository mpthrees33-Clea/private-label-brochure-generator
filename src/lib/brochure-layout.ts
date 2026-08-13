import type { BlockId, BrochureColor, BrochureData } from "./brochure-types";

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

/** Legacy summary of the uniform-grid layout (all swatches one size). */
export interface SwatchSummary {
  width: number;
  height: number;
  /** Number of PRIMARY rows. If hasDeco, total visual rows = primaryRows * 2. */
  primaryRows: number;
  /** Colors per primary row (last row may have fewer). */
  perRow: number;
}

/** One rendered swatch cell: a color plus its computed box dimensions.
 *  Cells in the same row share a height; widths follow each color's
 *  swatchAspect (default 0.5 = portrait 12"x24" field tile). */
export interface SwatchCell {
  color: BrochureColor;
  width: number;
  height: number;
}

export interface SwatchLayout extends SwatchSummary {
  /** Explicit primary rows of cells. If hasDeco, the renderer mirrors
   *  each primary row with a deco row of the same dimensions. */
  rows: SwatchCell[][];
  /** Total rendered height of the swatch block including labels, row
   *  gaps, and deco rows. Drives the default sizeMatrix y. */
  swatchBlockHeight: number;
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
): SwatchSummary {
  if (colorCount <= 0) return { width: 0, height: 0, primaryRows: 1, perRow: 0 };

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

  let best: SwatchSummary = { width: 0, height: 0, primaryRows: 1, perRow: colorCount };

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

const DEFAULT_SWATCH_ASPECT = 0.5;

function effectiveAspect(c: BrochureColor): number {
  const a = c.swatchAspect;
  if (typeof a !== "number" || !Number.isFinite(a) || a <= 0) {
    return DEFAULT_SWATCH_ASPECT;
  }
  return Math.min(3, Math.max(0.25, a));
}

/** Total rendered block height for a set of primary rows: every visual
 *  row is image + label, with SWATCH_ROW_GAP between visual rows. Deco
 *  doubles each primary row (mirrors ColorSwatchGrid's rendering). */
function blockHeight(rowHeights: number[], hasDeco: boolean): number {
  const perRowFactor = hasDeco ? 2 : 1;
  const visualRows = rowHeights.length * perRowFactor;
  if (visualRows === 0) return 0;
  const images =
    rowHeights.reduce((sum, h) => sum + h, 0) * perRowFactor;
  return (
    images + visualRows * SWATCH_LABEL_H + (visualRows - 1) * SWATCH_ROW_GAP
  );
}

/** Chunk an array into k rows of ceil(n/k), last row possibly short. */
function chunkRows<T>(items: T[], k: number): T[][] {
  const perRow = Math.ceil(items.length / k);
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += perRow) {
    out.push(items.slice(i, i + perRow));
  }
  return out;
}

export function getSwatchLayout(data: BrochureData): SwatchLayout {
  const hasDeco = data.colors.some((c) => c.decoImageUrl);
  const isLegacy =
    data.colors.every((c) => !c.rowGroup) &&
    data.colors.every(
      (c) => c.swatchAspect == null || c.swatchAspect === DEFAULT_SWATCH_ASPECT,
    );
  if (isLegacy) {
    // Legacy uniform grid — untouched math so every existing product
    // renders pixel-identically.
    const summary = computeSwatchLayout(data.colors.length, hasDeco);
    const rows =
      summary.perRow > 0
        ? chunkRows(data.colors, Math.ceil(data.colors.length / summary.perRow))
        : [];
    const cellRows = rows.map((row) =>
      row.map((color) => ({
        color,
        width: summary.width,
        height: summary.height,
      })),
    );
    // Replicate the historical defaultSizeMatrixY arithmetic exactly
    // (it used primaryRows, and yields 18px even for zero colors).
    const visualRows = summary.primaryRows * (hasDeco ? 2 : 1);
    const legacyBlockH =
      visualRows * (summary.height + SWATCH_LABEL_H) +
      Math.max(0, visualRows - 1) * SWATCH_ROW_GAP;
    return {
      ...summary,
      rows: cellRows,
      swatchBlockHeight: legacyBlockH,
    };
  }
  return computeGroupedSwatchLayout(data.colors, hasDeco);
}

/** Format-aware layout: colors are partitioned into ordered row-bands
 *  by rowGroup (mosaic collections: one band per format), each cell's
 *  width follows its color's swatchAspect, and we search for the row
 *  split that yields the tallest swatches that still fit the page-2
 *  vertical budget. */
function computeGroupedSwatchLayout(
  colors: BrochureColor[],
  hasDeco: boolean,
): SwatchLayout {
  if (colors.length === 0) {
    return {
      width: 0, height: 0, primaryRows: 1, perRow: 0,
      rows: [], swatchBlockHeight: 0,
    };
  }

  // Partition into groups: distinct rowGroup values in first-appearance
  // order; ungrouped colors form one trailing group.
  const groupOrder: string[] = [];
  const grouped = new Map<string, BrochureColor[]>();
  const ungrouped: BrochureColor[] = [];
  for (const c of colors) {
    const g = c.rowGroup?.trim();
    if (!g) {
      ungrouped.push(c);
      continue;
    }
    if (!grouped.has(g)) {
      groupOrder.push(g);
      grouped.set(g, []);
    }
    grouped.get(g)!.push(c);
  }
  const groups = groupOrder.map((g) => grouped.get(g)!);
  if (ungrouped.length > 0) groups.push(ungrouped);

  // Same vertical budget as the legacy path. Matrix rows scale with the
  // number of color entries (variants), not groups.
  const sectionGaps = 2;
  const fixedV =
    HEADER_H +
    BODY_TOP_GAP +
    SECTION_GAP * sectionGaps +
    estimateSizeMatrixHeight(colors.length) +
    FOOTNOTES_MAX_H +
    BOTTOM_BLOCK_H +
    SAFETY_BUFFER;
  const availV = Math.max(0, PAGE_H - fixedV);

  // Enumerate how many rows each group may span (1..3 each). Beyond 6
  // groups the search space explodes — fall back to one row per group.
  const splitChoices: number[][] =
    groups.length > 6
      ? [groups.map(() => 1)]
      : cartesian(groups.map((g) => rowCountOptions(g.length)));

  let best: { h: number; rows: BrochureColor[][] } | null = null;
  for (const split of splitChoices) {
    const rows = groups.flatMap((g, i) => chunkRows(g, split[i]));
    const visualRows = rows.length * (hasDeco ? 2 : 1);
    const vertMax = Math.floor(
      (availV - visualRows * SWATCH_LABEL_H - (visualRows - 1) * SWATCH_ROW_GAP) /
        visualRows,
    );
    let h = vertMax;
    for (const row of rows) {
      const aspectSum = row.reduce((sum, c) => sum + effectiveAspect(c), 0);
      const horizMax = Math.floor(
        (CONTENT_W - SWATCH_GAP_X * (row.length - 1)) / aspectSum,
      );
      h = Math.min(h, horizMax);
    }
    h = Math.max(0, h);
    // Tallest swatches win; on ties prefer fewer rows.
    if (!best || h > best.h || (h === best.h && rows.length < best.rows.length)) {
      best = { h, rows };
    }
  }

  const { h, rows } = best!;
  if (h < 36) {
    console.warn(
      `[brochure-layout] grouped swatch height ${h}px is very small ` +
        `(${colors.length} variants in ${groups.length} groups) — ` +
        `the brochure may be illegible or overflow.`,
    );
  }
  const cellRows = rows.map((row) =>
    row.map((color) => ({
      color,
      width: Math.floor(h * effectiveAspect(color)),
      height: h,
    })),
  );
  const maxPerRow = Math.max(...rows.map((r) => r.length));
  return {
    // Legacy summary fields, kept for callers that only need a gist.
    width: cellRows[0]?.[0]?.width ?? 0,
    height: h,
    primaryRows: rows.length,
    perRow: maxPerRow,
    rows: cellRows,
    swatchBlockHeight: blockHeight(rows.map(() => h), hasDeco),
  };
}

function rowCountOptions(groupSize: number): number[] {
  const max = Math.min(MAX_PRIMARY_ROWS, groupSize);
  return Array.from({ length: max }, (_, i) => i + 1);
}

function cartesian(options: number[][]): number[][] {
  return options.reduce<number[][]>(
    (acc, opts) => acc.flatMap((combo) => opts.map((o) => [...combo, o])),
    [[]],
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
