import sharp from "sharp";

// A full-face packshot is often a tile centered on a white canvas
// (a 3×16 plank inside a square file). Trim that padding so the
// tile fills its frame. Tile-colored corners are left alone.
// 30 eats a pale tile (Puro) once Shopify serves it as WebP.
// 18 still clears the white canvas and leaves the tile face.
export const NEAR_WHITE_THRESHOLD = 18;

// A concave sheet (trapezoid mosaic) still has white bays after the
// outer border is cut. Only white that touches the edge is removed, so
// a pale tile face stays opaque and the sheet silhouette is kept.
// 22 clears the white notches in a two-sheet mosaic photo. The tile
// body (Puro, alabaster) sits darker than this and stays opaque.
const EDGE_WHITE_DELTA = 22;

export async function trimNearWhite(
  bytes: Buffer,
): Promise<{ bytes: Buffer; width: number; height: number }> {
  const meta = await sharp(bytes, { failOn: "none" }).rotate().metadata();
  const fallbackW = meta.width ?? 0;
  const fallbackH = meta.height ?? 0;
  let trimmed = bytes;
  let width = fallbackW;
  let height = fallbackH;
  try {
    const cut = await sharp(bytes, { failOn: "none" })
      .rotate()
      .trim({ background: "#ffffff", threshold: NEAR_WHITE_THRESHOLD })
      .toBuffer({ resolveWithObject: true });
    if ((cut.info.width ?? 0) >= 8 && (cut.info.height ?? 0) >= 8) {
      trimmed = cut.data;
      width = cut.info.width ?? width;
      height = cut.info.height ?? height;
    }
  } catch {
    // sharp throws when the whole frame is the background color.
    trimmed = await sharp(bytes, { failOn: "none" }).rotate().toBuffer();
  }

  const raw = await sharp(trimmed, { failOn: "none" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const knocked = knockOutEdgeWhite(raw.data, raw.info.width, raw.info.height);
  if (!knocked) {
    return { bytes: trimmed, width: raw.info.width, height: raw.info.height };
  }
  const png = await sharp(raw.data, {
    raw: { width: raw.info.width, height: raw.info.height, channels: 4 },
  })
    .png()
    .toBuffer();
  return { bytes: png, width: raw.info.width, height: raw.info.height };
}

function knockOutEdgeWhite(rgba: Buffer, width: number, height: number): boolean {
  if (width < 2 || height < 2) return false;
  const near = (index: number) => {
    const offset = index * 4;
    return (
      rgba[offset] >= 255 - EDGE_WHITE_DELTA &&
      rgba[offset + 1] >= 255 - EDGE_WHITE_DELTA &&
      rgba[offset + 2] >= 255 - EDGE_WHITE_DELTA &&
      rgba[offset + 3] > 0
    );
  };
  const seen = new Uint8Array(width * height);
  const stack: number[] = [];
  const push = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const index = y * width + x;
    if (seen[index] || !near(index)) return;
    seen[index] = 1;
    stack.push(index);
  };
  for (let x = 0; x < width; x++) {
    push(x, 0);
    push(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    push(0, y);
    push(width - 1, y);
  }
  let changed = false;
  while (stack.length > 0) {
    const index = stack.pop() as number;
    const offset = index * 4;
    if (rgba[offset + 3] !== 0) {
      rgba[offset + 3] = 0;
      changed = true;
    }
    const x = index % width;
    const y = Math.floor(index / width);
    push(x + 1, y);
    push(x - 1, y);
    push(x, y + 1);
    push(x, y - 1);
  }
  return changed;
}
