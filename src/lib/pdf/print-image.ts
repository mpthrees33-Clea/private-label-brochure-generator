import sharp from "sharp";

// Brochure CSS pixels are 96 DPI. 2× that is enough for a sharp Letter
// print without embedding the factory's full-resolution files.
export const PRINT_SCALE = 2;
export const JPEG_QUALITY = 85;
const FALLBACK_MAX_EDGE = 1600;

export interface PrintSize {
  /** CSS pixel width of the rendered box. */
  width?: number;
  /** CSS pixel height of the rendered box. */
  height?: number;
  /** cover matches object-cover photos. inside keeps logos and the QR. */
  fit: "cover" | "inside";
}

export async function compressForPrint(
  bytes: Buffer,
  size: PrintSize,
): Promise<{ bytes: Buffer; contentType: string }> {
  const meta = await sharp(bytes, { failOn: "none" }).metadata();
  const srcW = meta.width ?? 0;
  const srcH = meta.height ?? 0;
  if (!srcW || !srcH) {
    return { bytes, contentType: contentTypeFrom(meta.format) };
  }

  const targetW = size.width ? size.width * PRINT_SCALE : undefined;
  const targetH = size.height ? size.height * PRINT_SCALE : undefined;
  const tooWide = targetW != null && srcW > targetW;
  const tooTall = targetH != null && srcH > targetH;
  const uncapped = targetW == null && targetH == null && Math.max(srcW, srcH) > FALLBACK_MAX_EDGE;
  const resize = tooWide || tooTall || uncapped;

  let pipeline = sharp(bytes, { failOn: "none" }).rotate();
  if (uncapped) {
    pipeline = pipeline.resize({
      width: srcW >= srcH ? FALLBACK_MAX_EDGE : undefined,
      height: srcH > srcW ? FALLBACK_MAX_EDGE : undefined,
      fit: "inside",
      withoutEnlargement: true,
    });
  } else if (resize && size.fit === "cover" && targetW && targetH) {
    pipeline = pipeline.resize(targetW, targetH, {
      fit: "cover",
      position: "centre",
      withoutEnlargement: true,
    });
  } else if (resize) {
    pipeline = pipeline.resize({
      width: targetW,
      height: targetH,
      fit: "inside",
      withoutEnlargement: true,
    });
  }

  // Logos and the QR are transparent or line art. JPEG would muddy them.
  const keepPng = size.fit === "inside" || Boolean(meta.hasAlpha);
  if (keepPng) {
    const out = await pipeline.png({ compressionLevel: 9 }).toBuffer();
    if (!resize && out.length >= bytes.length) {
      return { bytes, contentType: "image/png" };
    }
    return { bytes: out, contentType: "image/png" };
  }

  const out = await pipeline.jpeg({ quality: JPEG_QUALITY, mozjpeg: true }).toBuffer();
  if (!resize && meta.format === "jpeg" && out.length >= bytes.length) {
    return { bytes, contentType: "image/jpeg" };
  }
  return { bytes: out, contentType: "image/jpeg" };
}

function contentTypeFrom(format: string | undefined): string {
  if (format === "png") return "image/png";
  if (format === "webp") return "image/webp";
  if (format === "gif") return "image/gif";
  return "image/jpeg";
}
