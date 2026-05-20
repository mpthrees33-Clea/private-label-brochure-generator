import { put, get, list, del } from "@vercel/blob";
import { promises as fs } from "fs";
import path from "path";

// Storage strategy:
// - Vercel deploys: Vercel Blob (BLOB_READ_WRITE_TOKEN set, access:private).
// - Self-hosted (VPS/local): filesystem, rooted at QFB_DATA_DIR.
//
// Selection order:
//   1. QFB_DATA_DIR set → filesystem at that path (self-host).
//   2. BLOB_READ_WRITE_TOKEN set → Vercel Blob.
//   3. Otherwise → /tmp JSON files (local dev fallback).

const ACCESS: "private" = "private";

export interface StorageStatus {
  mode: "blob" | "fs" | "tmp";
  tokenSet: boolean;
  onVercel: boolean;
  dataDir: string | null;
  productionMissingToken: boolean;
}

export function getStorageStatus(): StorageStatus {
  const dataDir = process.env.QFB_DATA_DIR || null;
  const tokenSet = !!process.env.BLOB_READ_WRITE_TOKEN;
  const onVercel = !!process.env.VERCEL;
  let mode: "blob" | "fs" | "tmp";
  if (dataDir) mode = "fs";
  else if (tokenSet) mode = "blob";
  else mode = "tmp";
  return {
    mode,
    tokenSet,
    onVercel,
    dataDir,
    // Only flag this in the original Vercel + no-token combo. Self-host
    // (QFB_DATA_DIR set) bypasses the token check entirely.
    productionMissingToken: onVercel && !tokenSet && !dataDir,
  };
}

function requireConfigured() {
  const s = getStorageStatus();
  if (s.productionMissingToken) {
    throw new Error(
      "Storage not configured: BLOB_READ_WRITE_TOKEN is missing in this Vercel deployment. " +
        "Open the Vercel project → Storage → Create → Blob, then redeploy.",
    );
  }
}

function tmpPathFor(pathname: string): string {
  return path.join("/tmp", "qfb-" + pathname.replace(/[/]/g, "_"));
}

function fsPathFor(dataDir: string, pathname: string): string {
  // Mirror the blob layout 1:1 so a Vercel→VPS migration can rsync
  // products.json straight into $QFB_DATA_DIR/store/products.json.
  return path.join(dataDir, pathname);
}

async function readPrivateBlob(pathname: string): Promise<unknown | null> {
  // `get` requires the exact pathname; we don't need to list first.
  // useCache:false bypasses Vercel's CDN — critical for read-after-write
  // correctness. With caching on, a freshly written products.json can
  // still serve stale "not found" responses from the CDN edge, producing
  // the "saved but not visible on read" 404 cycle.
  // On a missing blob `get` throws BlobNotFoundError, which we catch.
  try {
    const result = await get(pathname, { access: ACCESS, useCache: false });
    if (!result || result.statusCode !== 200 || !result.stream) return null;
    const reader = result.stream.getReader();
    const chunks: Uint8Array[] = [];
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value) chunks.push(value);
    }
    const totalLen = chunks.reduce((n, c) => n + c.length, 0);
    const buf = new Uint8Array(totalLen);
    let offset = 0;
    for (const c of chunks) {
      buf.set(c, offset);
      offset += c.length;
    }
    const text = new TextDecoder().decode(buf);
    return JSON.parse(text);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Missing blob is the normal "first run" state; don't log noise.
    if (/not[\s_-]?found|404/i.test(msg)) return null;
    console.error(`[blob-storage] read failed for ${pathname}:`, err);
    return null;
  }
}

export async function readJsonStore<T>(
  pathname: string,
  fallback: T,
): Promise<T> {
  const s = getStorageStatus();
  if (s.productionMissingToken) return fallback;
  if (s.mode === "blob") {
    const result = await readPrivateBlob(pathname);
    return (result as T) ?? fallback;
  }
  const filePath =
    s.mode === "fs" && s.dataDir
      ? fsPathFor(s.dataDir, pathname)
      : tmpPathFor(pathname);
  try {
    const buf = await fs.readFile(filePath, "utf8");
    return JSON.parse(buf) as T;
  } catch {
    return fallback;
  }
}

export async function writeJsonStore(
  pathname: string,
  data: unknown,
): Promise<void> {
  requireConfigured();
  const s = getStorageStatus();
  if (s.mode === "blob") {
    try {
      await put(pathname, JSON.stringify(data), {
        access: ACCESS,
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: "application/json",
        cacheControlMaxAge: 0,
      });
      return;
    } catch (err) {
      console.error(`[blob-storage] write failed for ${pathname}:`, err);
      throw err;
    }
  }
  const filePath =
    s.mode === "fs" && s.dataDir
      ? fsPathFor(s.dataDir, pathname)
      : tmpPathFor(pathname);
  try {
    // Ensure parent dir exists — required for nested paths like
    // "store/products.json" under QFB_DATA_DIR.
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    // Write atomically — power loss / crash mid-write must not leave a
    // half-written products.json that breaks all subsequent reads.
    const tmp = filePath + ".tmp";
    await fs.writeFile(tmp, JSON.stringify(data, null, 2));
    await fs.rename(tmp, filePath);
  } catch (err) {
    console.error(`[blob-storage] fs write failed for ${pathname}:`, err);
    throw err;
  }
}

export async function deleteJsonStore(pathname: string): Promise<void> {
  const s = getStorageStatus();
  if (s.mode === "blob") {
    try {
      // 2.3+ supports del(pathname) directly — no need to list first.
      await del(pathname);
    } catch (err) {
      // Fall back to list-and-del if the direct call wasn't accepted.
      try {
        const { blobs } = await list({ prefix: pathname, limit: 5 });
        const match = blobs.find((b) => b.pathname === pathname);
        if (match) await del(match.url);
      } catch (innerErr) {
        console.error(
          `[blob-storage] delete failed for ${pathname}:`,
          innerErr,
          err,
        );
      }
    }
    return;
  }
  const filePath =
    s.mode === "fs" && s.dataDir
      ? fsPathFor(s.dataDir, pathname)
      : tmpPathFor(pathname);
  try {
    await fs.unlink(filePath);
  } catch {
    // not present — fine
  }
}
