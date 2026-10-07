import sharp from "sharp";

// A full-face packshot is often a tile centered on a white canvas
// (a 3×16 plank inside a square file). Trim that padding so the
// tile fills its frame. Tile-colored corners are left alone.
// 30 eats a pale tile (Puro) once Shopify serves it as WebP.
// 18 still clears the white canvas and leaves the tile face.
export const NEAR_WHITE_THRESHOLD = 18;

export async function trimNearWhite(
  bytes: Buffer,
): Promise<{ bytes: Buffer; width: number; height: number }> {
  const meta = await sharp(bytes, { failOn: "none" }).rotate().metadata();
  const fallbackW = meta.width ?? 0;
  const fallbackH = meta.height ?? 0;
  try {
    const trimmed = await sharp(bytes, { failOn: "none" })
      .rotate()
      .trim({ background: "#ffffff", threshold: NEAR_WHITE_THRESHOLD })
      .toBuffer({ resolveWithObject: true });
    const width = trimmed.info.width ?? 0;
    const height = trimmed.info.height ?? 0;
    if (width >= 8 && height >= 8) {
      return { bytes: trimmed.data, width, height };
    }
  } catch {
    // sharp throws when the whole frame is the background color.
  }
  const raw = await sharp(bytes, { failOn: "none" }).rotate().toBuffer();
  return { bytes: raw, width: fallbackW, height: fallbackH };
}
