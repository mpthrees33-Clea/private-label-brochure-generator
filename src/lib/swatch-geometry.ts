import type { BrochureColor, BrochureData, BrochureFace, BrochureSize } from "./brochure-types";
import { parseSizeLabel, sizeChartLabel } from "./scrapers/size-format";

export interface ResolvedFace {
  imageUrl: string;
  /** Slot width ÷ height. 1 is square, 0.5 is a 12×24 upright, >1 is a plank lying long. */
  ratio: number;
  /** No nominal size was parsed. The frame is not guessed as 1:2. */
  sizeUnknown: boolean;
  widthIn?: number | null;
  heightIn?: number | null;
  photoWidth?: number | null;
  photoHeight?: number | null;
  /** The only photo we have is a different shape than the tile. Contain it. */
  photoMismatch?: boolean;
  /** Irregular sheet (trapezoid). Contain the photo so the outline is not cropped. */
  keepOutline?: boolean;
  /** Short format under a sheet photo, e.g. "4x4 mosaic" or "trapezoid". */
  formatLabel?: string;
  caption: string;
}

/** A trimmed tile photo is close enough to the nominal frame to crop into it. */
export const PHOTO_RATIO_TOLERANCE = 0.1;

export function aspectWithin(
  photoWidth: number,
  photoHeight: number,
  ratio: number,
  tolerance = PHOTO_RATIO_TOLERANCE,
): boolean {
  if (!(photoWidth > 0) || !(photoHeight > 0) || !(ratio > 0)) return false;
  const photo = photoWidth / photoHeight;
  const delta = photo > ratio ? photo / ratio : ratio / photo;
  return delta <= 1 + tolerance;
}

/**
 * Cover when the photo (after a white trim) already matches the tile.
 * A factory card that is a different shape is contained, and the editor
 * flags it, until a full-face file is found.
 */
export function swatchFit(
  ratio: number,
  photoWidth?: number | null,
  photoHeight?: number | null,
  sizeUnknown?: boolean,
  photoMismatch?: boolean,
  keepOutline?: boolean,
): "cover" | "contain" {
  if (sizeUnknown || photoMismatch || keepOutline) return "contain";
  if (!photoWidth || !photoHeight || photoWidth <= 0 || photoHeight <= 0 || ratio <= 0) {
    return "cover";
  }
  return aspectWithin(photoWidth, photoHeight, ratio) ? "cover" : "contain";
}

/** Width and height in inches, oriented the way the frame is drawn. */
export function nominalUnits(
  ratio: number,
  widthIn?: number | null,
  heightIn?: number | null,
): { w: number; h: number } {
  if (widthIn && heightIn && widthIn > 0 && heightIn > 0) {
    const short = Math.min(widthIn, heightIn);
    const long = Math.max(widthIn, heightIn);
    if (ratio >= 1) return { w: long, h: short };
    return { w: short, h: long };
  }
  const r = clamp(ratio);
  if (r >= 1) return { w: r, h: 1 };
  return { w: 1, h: 1 / r };
}

export function facePhotoMismatch(face: {
  photoMismatch?: boolean | null;
  sizeUnknown?: boolean | null;
  aspectRatio?: number | null;
  widthIn?: number | null;
  heightIn?: number | null;
  photoWidth?: number | null;
  photoHeight?: number | null;
}): boolean {
  if (face.photoMismatch) return true;
  if (face.sizeUnknown) return false;
  const ratio =
    face.aspectRatio && face.aspectRatio > 0
      ? face.aspectRatio
      : nominalAspectRatio(face.widthIn, face.heightIn);
  if (!ratio || !face.photoWidth || !face.photoHeight) return false;
  return !aspectWithin(face.photoWidth, face.photoHeight, ratio);
}

/**
 * Frame width ÷ height from the nominal size only. Factory thumbnails
 * are often crops (a square deco shipped as a wide strip) and must not
 * decide the frame.
 *
 * Squares (8×8, 4×4 mosaic) are 1. A plank or subway under 4" on the
 * short side is drawn long and thin (3×16, 7.5×40cm, 3×6). Wider
 * rectangles stand upright: 4×16, and 12×24 at 1:2.
 * Returns null when the size is missing — callers mark that "size unknown".
 */
export function nominalAspectRatio(
  widthIn?: number | null,
  heightIn?: number | null,
): number | null {
  const tileW = widthIn ?? 0;
  const tileH = heightIn ?? 0;
  if (!(tileW > 0) || !(tileH > 0)) return null;
  const short = Math.min(tileW, tileH);
  const long = Math.max(tileW, tileH);
  if (long / short < 1.12) return 1;
  if (short < 4 && long / short >= 2) return clamp(long / short);
  return clamp(short / long);
}

/** Drop a field column that only repeats a mosaic chip (Atlas 4×4 vs 4×4 sheet). */
export function omitChipFieldSizes(data: BrochureData): BrochureData {
  const chips = data.sizes.filter(
    (size) => size.sheetLabel && /mosaic/i.test(size.label) && !/trapezoid/i.test(size.label),
  );
  if (chips.length === 0) return data;
  const dropped = new Set<string>();
  const sizes = data.sizes.filter((size) => {
    if (/mosaic|trapezoid/i.test(size.label) || size.isDeco) return true;
    const parsed = parseSizeLabel(size.label);
    if (!parsed || parsed.widthIn <= 0) return true;
    const twin = chips.some((chip) => {
      const piece = parseSizeLabel(chip.label);
      return Boolean(piece && piece.widthIn === parsed.widthIn && piece.heightIn === parsed.heightIn);
    });
    if (!twin) return true;
    dropped.add(sizeChartLabel(size).toLowerCase());
    dropped.add(parsed.label.toLowerCase());
    return false;
  });
  if (dropped.size === 0) return data;
  const charts = sizes.map((size) => sizeChartLabel(size));
  const availability: BrochureData["availability"] = {};
  for (const [key, labels] of Object.entries(data.availability)) {
    const kept = labels.filter((label) => !dropped.has(label.toLowerCase()));
    availability[key] = kept.length > 0 ? kept : charts;
  }
  return { ...data, sizes, availability };
}

export function resolveSwatchFaces(
  color: BrochureColor,
  sizes: BrochureSize[] = [],
): ResolvedFace[] {
  const stored = (color.faces ?? []).filter((face) => face.imageUrl && face.imageUrl.trim());
  if (stored.length > 0) {
    const resolvedFaces = stored.map((face, index) => {
      const resolved = ratioForFace(face, sizes);
      const widthIn = resolved.widthIn ?? face.widthIn;
      const heightIn = resolved.heightIn ?? face.heightIn;
      return {
        imageUrl: face.imageUrl,
        ratio: resolved.ratio,
        sizeUnknown: resolved.sizeUnknown,
        widthIn,
        heightIn,
        photoWidth: face.photoWidth,
        photoHeight: face.photoHeight,
        photoMismatch: facePhotoMismatch({
          ...face,
          aspectRatio: resolved.ratio,
          sizeUnknown: resolved.sizeUnknown,
          widthIn,
          heightIn,
        }),
        keepOutline: resolved.keepOutline,
        formatLabel: resolved.formatLabel,
        caption: faceCaption(color.trinityName, face, index, stored),
      };
    });
    return labelPlainFaces(labelSheetFaces(equalizeSheetFaces(resolvedFaces)), color.trinityName);
  }

  const fieldSize = sizes.find((size) => !size.isDeco && !/\bdeco\b/i.test(size.label));
  const decoSize = sizes.find((size) => size.isDeco || /\bdeco\b/i.test(size.label));
  const faces: ResolvedFace[] = [];
  if (color.imageUrl && color.imageUrl.trim()) {
    const fromName = sizeFromUrl(color.imageUrl);
    const resolved = framed(
      fromName?.widthIn ?? fieldSizeIn(fieldSize)?.widthIn,
      fromName?.heightIn ?? fieldSizeIn(fieldSize)?.heightIn,
    );
    const fieldIn = fromName ?? fieldSizeIn(fieldSize);
    faces.push({
      imageUrl: color.imageUrl,
      ratio: resolved.ratio,
      sizeUnknown: resolved.sizeUnknown,
      widthIn: fieldIn?.widthIn,
      heightIn: fieldIn?.heightIn,
      caption: color.trinityName,
    });
  }
  if (color.decoImageUrl && color.decoImageUrl.trim()) {
    const fromName = sizeFromUrl(color.decoImageUrl);
    const resolved = framed(
      fromName?.widthIn ?? fieldSizeIn(decoSize)?.widthIn,
      fromName?.heightIn ?? fieldSizeIn(decoSize)?.heightIn,
    );
    const decoIn = fromName ?? fieldSizeIn(decoSize);
    faces.push({
      imageUrl: color.decoImageUrl,
      ratio: resolved.ratio,
      sizeUnknown: resolved.sizeUnknown,
      widthIn: decoIn?.widthIn,
      heightIn: decoIn?.heightIn,
      caption: `${color.trinityName.replace(/\s+deco$/i, "")} deco`,
    });
  }
  if (faces.length === 0) {
    const box = fieldSizeIn(fieldSize);
    const resolved = framed(box?.widthIn, box?.heightIn);
    faces.push({
      imageUrl: "",
      ratio: resolved.ratio,
      sizeUnknown: resolved.sizeUnknown,
      widthIn: box?.widthIn,
      heightIn: box?.heightIn,
      caption: color.trinityName,
    });
  }
  return faces;
}

function ratioForFace(
  face: BrochureFace,
  sizes: BrochureSize[],
): {
  ratio: number;
  sizeUnknown: boolean;
  widthIn?: number;
  heightIn?: number;
  keepOutline?: boolean;
  formatLabel?: string;
} {
  const sheet = sheetPhotoSize(face, sizes);
  if (sheet) return { ...framed(sheet.widthIn, sheet.heightIn), ...sheet };
  if (typeof face.aspectRatio === "number" && face.aspectRatio > 0 && !face.sizeUnknown) {
    return { ratio: clamp(face.aspectRatio), sizeUnknown: false };
  }
  if (face.widthIn && face.heightIn && !face.sizeUnknown) return framed(face.widthIn, face.heightIn);
  const fromUrl = sizeFromUrl(face.imageUrl);
  if (fromUrl) return framed(fromUrl.widthIn, fromUrl.heightIn);
  // A stored face with no nominal size stays unknown. Borrowing the
  // chart's first format would label a trapezoid as a 4×4.
  return { ratio: 1, sizeUnknown: true };
}

/**
 * A mosaic photo shows the sheet, not the chip. A 3×3 of 4×4 tiles is
 * a 12×12 sheet, same as the trapezoid sheet beside it. Single field
 * and deco tiles (an 8×8 next to a 3×16) are not sheets.
 */
function sheetPhotoSize(
  face: BrochureFace,
  sizes: BrochureSize[],
): { widthIn: number; heightIn: number; keepOutline: boolean; formatLabel: string } | null {
  const url = face.imageUrl || "";
  if (/trapez|trapes/i.test(url)) {
    const size = sizes.find((item) => /trapezoid/i.test(item.label) && item.sheetLabel);
    const parsed = size?.sheetLabel ? parseSizeLabel(size.sheetLabel) : null;
    const widthIn = parsed?.widthIn || 0;
    const heightIn = parsed?.heightIn || 0;
    if (widthIn <= 0 || heightIn <= 0) return null;
    return { widthIn, heightIn, keepOutline: true, formatLabel: "trapezoid" };
  }
  const inches =
    face.widthIn && face.heightIn
      ? { widthIn: face.widthIn, heightIn: face.heightIn }
      : sizeFromUrl(url);
  if (!inches) return null;
  const mosaic = sizes.find((item) => {
    if (!item.sheetLabel || !/mosaic/i.test(item.label) || /trapezoid/i.test(item.label)) return false;
    const chip = parseSizeLabel(item.label);
    return Boolean(chip && chip.widthIn === inches.widthIn && chip.heightIn === inches.heightIn);
  });
  if (!mosaic?.sheetLabel) return null;
  const sheet = parseSizeLabel(mosaic.sheetLabel);
  if (!sheet || sheet.widthIn <= 0 || sheet.heightIn <= 0) return null;
  const chip = parseSizeLabel(mosaic.label);
  const formatLabel =
    chip && chip.widthIn > 0 ? `${trimInches(chip.widthIn)}x${trimInches(chip.heightIn)} mosaic` : "mosaic";
  return { widthIn: sheet.widthIn, heightIn: sheet.heightIn, keepOutline: false, formatLabel };
}

function trimInches(value: number): string {
  return Number.isInteger(value) ? String(value) : String(value);
}

/** Sheet photos in one color share one display size. Field tiles do not. */
function equalizeSheetFaces(faces: ResolvedFace[]): ResolvedFace[] {
  const sheets = faces.filter((face) => face.formatLabel);
  if (sheets.length < 2) return faces;
  const side = Math.max(...sheets.map((face) => Math.max(face.widthIn ?? 0, face.heightIn ?? 0)));
  if (!(side > 0)) return faces;
  const box = framed(side, side);
  return faces.map((face) =>
    face.formatLabel
      ? { ...face, widthIn: side, heightIn: side, ratio: box.ratio, sizeUnknown: false }
      : face,
  );
}

function labelSheetFaces(faces: ResolvedFace[]): ResolvedFace[] {
  const labels = new Set(faces.map((face) => face.formatLabel).filter(Boolean));
  if (labels.size < 2) return faces;
  return faces.map((face) => (face.formatLabel ? { ...face, caption: face.formatLabel } : face));
}

/** Two field sizes with no finish of their own get a format caption and one color name. */
function labelPlainFaces(faces: ResolvedFace[], colorName: string): ResolvedFace[] {
  if (faces.length < 2 || faces.some((face) => face.formatLabel)) return faces;
  const allNamed = faces.every(
    (face) => face.caption.trim().toLowerCase() === colorName.trim().toLowerCase(),
  );
  if (!allNamed) return faces;
  return faces.map((face) => {
    const formatLabel =
      face.widthIn && face.heightIn
        ? `${trimInches(face.widthIn)}x${trimInches(face.heightIn)}`
        : face.caption;
    return { ...face, formatLabel, caption: formatLabel };
  });
}

/** A missing size is a square hold so the old 1:2 frame cannot sneak back. */
function framed(
  widthIn?: number | null,
  heightIn?: number | null,
): { ratio: number; sizeUnknown: boolean } {
  const ratio = nominalAspectRatio(widthIn, heightIn);
  if (ratio == null) return { ratio: 1, sizeUnknown: true };
  return { ratio, sizeUnknown: false };
}

function faceCaption(
  colorName: string,
  face: BrochureFace,
  index: number,
  faces: BrochureFace[],
): string {
  const name = colorName.replace(/\s+deco$/i, "").trim();
  const finish = (face.finish || "").trim();
  const several = faces.length > 1;
  if (!several) return colorName;
  if (face.isDeco && !finish) return `${name} deco`;
  if (finish) return index === 0 ? `${name} ${finish}` : finish;
  if (face.isDeco) return `${name} deco`;
  return index === 0 ? name : colorName;
}

function sizeFromUrl(url: string): { widthIn: number; heightIn: number } | null {
  const base = (url || "").split("?")[0]?.split("/").pop() ?? "";
  const matches = base.match(/(\d{1,2}(?:_\d)?)[x×](\d{1,3})(?!\d)/gi) ?? [];
  for (const token of matches) {
    const parsed = parseSizeLabel(token.replace(/_/g, "."));
    if (!parsed || parsed.widthIn <= 0 || parsed.heightIn <= 0) continue;
    if (Math.max(parsed.widthIn, parsed.heightIn) > 48) continue;
    return { widthIn: parsed.widthIn, heightIn: parsed.heightIn };
  }
  return null;
}

function fieldSizeIn(
  size: BrochureSize | undefined,
): { widthIn: number; heightIn: number } | null {
  if (!size) return null;
  const parsed = parseSizeLabel(`${size.label}${size.isDeco ? " deco" : ""}`);
  if (!parsed || parsed.widthIn <= 0 || parsed.heightIn <= 0) return null;
  return { widthIn: parsed.widthIn, heightIn: parsed.heightIn };
}

function clamp(ratio: number): number {
  if (!Number.isFinite(ratio) || ratio <= 0) return 1;
  return Math.min(8, Math.max(0.12, ratio));
}
