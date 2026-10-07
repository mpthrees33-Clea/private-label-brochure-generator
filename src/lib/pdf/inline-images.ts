import { readFile } from "fs/promises";
import path from "path";
import { fetchRemoteImage } from "@/lib/image-fetch";
import { sniffImageMime } from "@/lib/image-sniff";
import { compressForPrint, type PrintSize } from "@/lib/pdf/print-image";
import { readUpload } from "@/lib/store/uploads";

// 1×1 transparent gif. Used when an image cannot be inlined so Chromium
// does not try to fetch the app (auth, deployment protection, or no
// listener on 127.0.0.1).
const TRANSPARENT_GIF =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

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
      replacements.set(src, (await imageSrcToDataUri(src, size)) ?? TRANSPARENT_GIF);
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
  try {
    const file = await loadImage(src);
    if (!file) return null;
    const compressed = await compressForPrint(file.bytes, size).catch(() => null);
    return bufferToDataUri(compressed ?? file);
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
