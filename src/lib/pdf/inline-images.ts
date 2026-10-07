import { readFile } from "fs/promises";
import path from "path";
import { fetchRemoteImage } from "@/lib/image-fetch";
import { sniffImageMime } from "@/lib/image-sniff";
import { readUpload } from "@/lib/store/uploads";

// 1×1 transparent gif. Used when an image cannot be inlined so Chromium
// does not try to fetch the app (auth, deployment protection, or no
// listener on 127.0.0.1).
const TRANSPARENT_GIF =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

export async function inlineBrochureImages(html: string): Promise<string> {
  const srcs = new Set<string>();
  const re = /\bsrc="([^"]*)"/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    srcs.add(decodeHtml(match[1]));
  }

  const replacements = new Map<string, string>();
  await Promise.all(
    [...srcs].map(async (src) => {
      if (!src || src.startsWith("data:")) return;
      replacements.set(src, (await imageSrcToDataUri(src)) ?? TRANSPARENT_GIF);
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

async function imageSrcToDataUri(src: string): Promise<string | null> {
  try {
    if (src.startsWith("/api/proxy-image")) {
      const url = new URL(src, "http://brochure.local").searchParams.get("url");
      if (!url) return null;
      return bufferToDataUri(await fetchRemoteImage(url));
    }
    if (src.startsWith("/api/uploads/")) {
      const filename = decodeURIComponent(src.slice("/api/uploads/".length).split("?")[0]);
      const uploaded = await readUpload(filename);
      if (!uploaded) return null;
      return bufferToDataUri({ bytes: uploaded.buffer, contentType: uploaded.contentType });
    }
    if (src.startsWith("/")) {
      const file = await readPublicFile(src);
      if (!file) return null;
      return bufferToDataUri(file);
    }
    if (/^https?:\/\//i.test(src)) {
      return bufferToDataUri(await fetchRemoteImage(src));
    }
  } catch {
    return null;
  }
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
