import type { BrochureColor, BrochureFace, BrochureSize } from "./brochure-types";
import { parseSizeLabel } from "./scrapers/size-format";

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
): "cover" | "contain" {
  if (sizeUnknown || photoMismatch) return "contain";
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

export function resolveSwatchFaces(
  color: BrochureColor,
  sizes: BrochureSize[] = [],
): ResolvedFace[] {
  const stored = (color.faces ?? []).filter((face) => face.imageUrl && face.imageUrl.trim());
  if (stored.length > 0) {
    return stored.map((face, index) => {
      const resolved = ratioForFace(face, sizes);
      return {
        imageUrl: face.imageUrl,
        ratio: resolved.ratio,
        sizeUnknown: resolved.sizeUnknown,
        widthIn: face.widthIn,
        heightIn: face.heightIn,
        photoWidth: face.photoWidth,
        photoHeight: face.photoHeight,
        photoMismatch: facePhotoMismatch({
          ...face,
          aspectRatio: resolved.ratio,
          sizeUnknown: resolved.sizeUnknown,
        }),
        caption: faceCaption(color.trinityName, face, index, stored),
      };
    });
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
): { ratio: number; sizeUnknown: boolean } {
  if (typeof face.aspectRatio === "number" && face.aspectRatio > 0) {
    return { ratio: clamp(face.aspectRatio), sizeUnknown: false };
  }
  if (face.widthIn && face.heightIn) return framed(face.widthIn, face.heightIn);
  const fromUrl = sizeFromUrl(face.imageUrl);
  if (fromUrl) return framed(fromUrl.widthIn, fromUrl.heightIn);
  // A stored face with no nominal size stays unknown. Borrowing the
  // chart's first format would label a trapezoid as a 4×4.
  return { ratio: 1, sizeUnknown: true };
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
