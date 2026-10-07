import { readFile } from "fs/promises";
import path from "path";
import sharp from "sharp";
import { fetchRemoteImage, isDeniedImageHost } from "@/lib/image-fetch";
import { sniffImageMime } from "@/lib/image-sniff";
import { compressForPrint, type PrintSize } from "@/lib/pdf/print-image";
import { readUpload } from "@/lib/store/uploads";

// The old fallback was this 1×1 transparent GIF. Chromium then printed
// empty gray boxes and pdfimages reported a 1×1 image plus a 1×1 mask.
const BLANK_GIF_PREFIX = "data:image/gif;base64,R0lGODlhAQAB";

interface ImgRef {
  src: string;
  size: PrintSize;
}

export async function inlineBrochureImages(html: string): Promise<string> {
  const images = parseImages(html);
  const bySrc = new Map<string, PrintSize>();
  for (const image of images) {
    // The same URL can appear at two sizes. Keep the larger box so a
    // hero and a swatch that share a file both stay sharp.
    const prev = bySrc.get(image.src);
    if (!prev || boxArea(image.size) > boxArea(prev)) bySrc.set(image.src, image.size);
  }

  const replacements = new Map<string, string>();
  await Promise.all(
    [...bySrc.entries()].map(async ([src, size]) => {
      if (!src || src.startsWith("data:")) return;
      const inlined = await imageSrcToDataUri(src, size);
      if (inlined) {
        replacements.set(src, inlined);
        return;
      }
      // Inlining failed. Leave a public factory URL so Chromium can fetch
      // it while printing. Never substitute a 1×1 GIF. App-relative and
      // private URLs stay empty so the render step can refuse the PDF.
      const remote = publicRemoteUrl(src);
      if (remote) {
        console.error(`brochure image will be fetched in-page: ${remote.slice(0, 200)}`);
        replacements.set(src, remote);
      } else {
        console.error(`brochure image could not be inlined: ${src.slice(0, 200)}`);
        replacements.set(src, "");
      }
    }),
  );

  let out = html;
  for (const [src, dataUri] of replacements) {
    const encoded = src.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
    out = out.split(`src="${encoded}"`).join(`src="${dataUri}"`);
    if (encoded !== src) {
      out = out.split(`src="${src}"`).join(`src="${dataUri}"`);
    }
  }
  return out;
}

function parseImages(html: string): ImgRef[] {
  const tags = html.match(/<img\b[^>]*>/gi) ?? [];
  const out: ImgRef[] = [];
  for (const tag of tags) {
    const srcMatch = /\bsrc="([^"]*)"/.exec(tag);
    if (!srcMatch) continue;
    const width = attrNumber(tag, "data-print-w");
    const height = attrNumber(tag, "data-print-h");
    const fit = /\bdata-print-fit="cover"/.test(tag) ? "cover" : "inside";
    out.push({ src: decodeHtml(srcMatch[1]), size: { width, height, fit } });
  }
  return out;
}

function attrNumber(tag: string, name: string): number | undefined {
  const match = new RegExp(`\\b${name}="(\\d+)"`).exec(tag);
  if (!match) return undefined;
  const value = Number(match[1]);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

function boxArea(size: PrintSize): number {
  return (size.width ?? 1) * (size.height ?? 1);
}

async function imageSrcToDataUri(src: string, size: PrintSize): Promise<string | null> {
  let lastError = "no image";
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const file = await loadImage(src);
      if (!file) {
        lastError = "fetch returned no image";
        break;
      }
      const compressed = await compressForPrint(file.bytes, size).catch((err: unknown) => {
        lastError = err instanceof Error ? err.message : String(err);
        console.error(`brochure image compress failed: ${lastError} src=${src.slice(0, 160)}`);
        return null;
      });
      const chosen = (await usablePrintFile(compressed)) ? compressed : (await usablePrintFile(file)) ? file : null;
      const uri = bufferToDataUri(chosen);
      if (uri && !uri.startsWith(BLANK_GIF_PREFIX)) return uri;
      lastError = lastError || "image decoded as blank";
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }
  console.error(`brochure image inline failed: ${lastError} src=${src.slice(0, 200)}`);
  return null;
}

async function usablePrintFile(
  file: { bytes: Buffer; contentType: string } | null,
): Promise<boolean> {
  if (!file || file.bytes.length < 32) return false;
  if (file.bytes[0] === 0x47 && file.bytes[1] === 0x49 && file.bytes[2] === 0x46 && file.bytes.length < 64) {
    return false;
  }
  try {
    const meta = await sharp(file.bytes, { failOn: "none" }).metadata();
    return (meta.width ?? 0) > 1 && (meta.height ?? 0) > 1;
  } catch (err) {
    console.error(
      `brochure image metadata failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    const sniffed = sniffImageMime(new Uint8Array(file.bytes));
    return sniffed === "image/jpeg" || sniffed === "image/png" || sniffed === "image/webp";
  }
}

/** Data-URI images that would print as empty slots. Remote URLs are checked later, in Chromium. */
export async function findBlankInlinedImages(html: string): Promise<string[]> {
  const blanks: string[] = [];
  for (const image of parseImages(html)) {
    const src = image.src;
    if (!src || src.startsWith(BLANK_GIF_PREFIX)) {
      blanks.push(src ? "1x1 placeholder" : "empty image");
      continue;
    }
    if (!src.startsWith("data:")) continue;
    const bytes = dataUriBytes(src);
    if (!bytes || bytes.length < 32) {
      blanks.push("blank data image");
      continue;
    }
    try {
      const meta = await sharp(bytes, { failOn: "none" }).metadata();
      if ((meta.width ?? 0) <= 1 || (meta.height ?? 0) <= 1) {
        blanks.push(`${meta.width ?? 0}x${meta.height ?? 0} image`);
      }
    } catch {
      blanks.push("undecodable image");
    }
  }
  return blanks;
}

function dataUriBytes(src: string): Buffer | null {
  const match = /^data:image\/[a-z0-9.+-]+;base64,([a-z0-9+/=\s]+)$/i.exec(src);
  if (!match) return null;
  return Buffer.from(match[1], "base64");
}

function publicRemoteUrl(src: string): string | null {
  const remote = src.startsWith("/api/proxy-image")
    ? new URL(src, "http://brochure.local").searchParams.get("url")
    : /^https?:\/\//i.test(src)
      ? src
      : null;
  if (!remote) return null;
  try {
    const parsed = new URL(remote);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    if (isDeniedImageHost(parsed.hostname)) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

async function loadImage(
  src: string,
): Promise<{ bytes: Buffer; contentType: string } | null> {
  if (src.startsWith("/api/proxy-image")) {
    const url = new URL(src, "http://brochure.local").searchParams.get("url");
    if (!url) return null;
    return fetchRemoteImage(url);
  }
  if (src.startsWith("/api/uploads/")) {
    const filename = decodeURIComponent(src.slice("/api/uploads/".length).split("?")[0]);
    const uploaded = await readUpload(filename);
    if (!uploaded) return null;
    return { bytes: uploaded.buffer, contentType: uploaded.contentType };
  }
  if (src.startsWith("/")) return readPublicFile(src);
  if (/^https?:\/\//i.test(src)) return fetchRemoteImage(src);
  return null;
}

async function readPublicFile(
  urlPath: string,
): Promise<{ bytes: Buffer; contentType: string } | null> {
  const pathname = decodeURIComponent(urlPath.split("?")[0]);
  if (!pathname.startsWith("/") || pathname.includes("\0")) return null;
  const publicRoot = path.resolve(process.cwd(), "public");
  const abs = path.resolve(publicRoot, pathname.slice(1));
  if (abs !== publicRoot && !abs.startsWith(publicRoot + path.sep)) return null;
  try {
    const bytes = await readFile(abs);
    const contentType = sniffImageMime(new Uint8Array(bytes)) ?? mimeFromPath(abs);
    if (!contentType) return null;
    return { bytes, contentType };
  } catch {
    return null;
  }
}

function bufferToDataUri(
  file: { bytes: Buffer; contentType: string } | null,
): string | null {
  if (!file || file.bytes.byteLength === 0) return null;
  const sniffed = sniffImageMime(new Uint8Array(file.bytes));
  const header = file.contentType.toLowerCase();
  const contentType = header.startsWith("image/") ? header.split(";")[0].trim() : sniffed;
  if (!contentType) return null;
  return `data:${contentType};base64,${file.bytes.toString("base64")}`;
}

function mimeFromPath(filePath: string): string | null {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  return null;
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}
