import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";

// Local binary uploads. Reps on iPhones can't easily copy image URLs from
// Safari, but they can copy/save the actual image. This module accepts
// those bytes, writes them under $QFB_UPLOADS_DIR, and hands back a
// same-origin URL that slots into product.colors[].imageUrl just like a
// factory CDN link would.
//
// Selection order for the storage dir:
//   1. $QFB_UPLOADS_DIR set → use it directly.
//   2. $QFB_DATA_DIR set → $QFB_DATA_DIR/uploads (alongside the
//      "store" subdir that blob-storage writes products.json into).
//   3. /tmp/qfb-uploads (local dev fallback).

const MAX_BYTES = 15 * 1024 * 1024; // iPhone photos run ~3-8MB; 15MB headroom

// Allowlist by content-type. The extension is derived from this, not from
// the original filename, so a malicious upload can't smuggle a .php or
// .html extension into the uploads dir.
const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/heic": "heic",
  "image/heif": "heic",
};

const CT_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  heic: "image/heic",
};

// Filename format: 16 hex chars + dotted ext. No path separators, no
// trailing dots, no upper-case extension — anything else is rejected by
// readUpload to block traversal attempts like ../../../etc/passwd.
const SAFE_NAME = /^[a-f0-9]{16}\.[a-z0-9]{3,4}$/;

export function getUploadsDir(): string {
  if (process.env.QFB_UPLOADS_DIR) return process.env.QFB_UPLOADS_DIR;
  if (process.env.QFB_DATA_DIR)
    return path.join(process.env.QFB_DATA_DIR, "uploads");
  return "/tmp/qfb-uploads";
}

export function isSafeFilename(name: string): boolean {
  return SAFE_NAME.test(name);
}

export async function saveUpload(
  buffer: Buffer,
  contentType: string,
): Promise<{ filename: string; url: string }> {
  const ct = (contentType || "").split(";")[0].trim().toLowerCase();
  const ext = ALLOWED_TYPES[ct];
  if (!ext) throw new Error(`unsupported content-type: ${ct || "(missing)"}`);
  if (buffer.length === 0) throw new Error("empty image");
  if (buffer.length > MAX_BYTES)
    throw new Error(
      `image too large (${(buffer.length / 1024 / 1024).toFixed(1)}MB, max ${MAX_BYTES / 1024 / 1024}MB)`,
    );
  const dir = getUploadsDir();
  await fs.mkdir(dir, { recursive: true });
  const id = crypto.randomBytes(8).toString("hex");
  const filename = `${id}.${ext}`;
  const filePath = path.join(dir, filename);
  await fs.writeFile(filePath, buffer);
  return { filename, url: `/api/uploads/${filename}` };
}

export async function readUpload(
  filename: string,
): Promise<{ buffer: Buffer; contentType: string } | null> {
  if (!isSafeFilename(filename)) return null;
  const ext = filename.split(".").pop()!.toLowerCase();
  const ct = CT_BY_EXT[ext];
  if (!ct) return null;
  const filePath = path.join(getUploadsDir(), filename);
  try {
    const buffer = await fs.readFile(filePath);
    return { buffer, contentType: ct };
  } catch {
    return null;
  }
}
