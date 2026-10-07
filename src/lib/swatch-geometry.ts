import type { BrochureColor, BrochureFace, BrochureSize } from "./brochure-types";
import { parseSizeLabel } from "./scrapers/size-format";

export interface ResolvedFace {
  imageUrl: string;
  /** Slot width ÷ height. 1 is square, 0.5 is a 12×24 upright, >1 is a plank lying long. */
  ratio: number;
  /** No nominal size was parsed. The frame is not guessed as 1:2. */
  sizeUnknown: boolean;
  photoWidth?: number | null;
  photoHeight?: number | null;
  caption: string;
}

/**
 * Crop to the nominal frame when the file is already about that shape.
 * A factory card that is a much wider crop (the 670×210 Aura strip of a
 * square deco) is contained instead, so the pattern is not sliced.
 */
export function swatchFit(
  ratio: number,
  photoWidth?: number | null,
  photoHeight?: number | null,
  sizeUnknown?: boolean,
): "cover" | "contain" {
  if (sizeUnknown) return "contain";
  if (!photoWidth || !photoHeight || photoWidth <= 0 || photoHeight <= 0 || ratio <= 0) {
    return "cover";
  }
  const photo = photoWidth / photoHeight;
  const delta = photo > ratio ? photo / ratio : ratio / photo;
  return delta > 1.6 ? "contain" : "cover";
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
        photoWidth: face.photoWidth,
        photoHeight: face.photoHeight,
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
    faces.push({
      imageUrl: color.imageUrl,
      ratio: resolved.ratio,
      sizeUnknown: resolved.sizeUnknown,
      caption: color.trinityName,
    });
  }
  if (color.decoImageUrl && color.decoImageUrl.trim()) {
    const fromName = sizeFromUrl(color.decoImageUrl);
    const resolved = framed(
      fromName?.widthIn ?? fieldSizeIn(decoSize)?.widthIn,
      fromName?.heightIn ?? fieldSizeIn(decoSize)?.heightIn,
    );
    faces.push({
      imageUrl: color.decoImageUrl,
      ratio: resolved.ratio,
      sizeUnknown: resolved.sizeUnknown,
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
