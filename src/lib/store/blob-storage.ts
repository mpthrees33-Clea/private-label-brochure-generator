import { put, get, list, del } from "@vercel/blob";
import { promises as fs } from "fs";
import path from "path";

// Storage strategy:
// - Production (Vercel): Vercel Blob, private access. Reads go through
//   the @vercel/blob `get` helper (authenticated, not a public fetch).
//   Writes use `allowOverwrite: true` so we don't have to del-then-put.
// - Local dev (no token): /tmp JSON files.
//
// We MUST use access:'private' to match the user's existing Blob
// store — public-access puts get rejected by Vercel.

const ACCESS: "private" = "private";

export interface StorageStatus {
  mode: "blob" | "tmp";
  tokenSet: boolean;
  onVercel: boolean;
  productionMissingToken: boolean;
}

export function getStorageStatus(): StorageStatus {
  const tokenSet = !!process.env.BLOB_READ_WRITE_TOKEN;
  const onVercel = !!process.env.VERCEL;
  return {
    mode: tokenSet ? "blob" : "tmp",
    tokenSet,
    onVercel,
    productionMissingToken: onVercel && !tokenSet,
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
  try {
    const buf = await fs.readFile(tmpPathFor(pathname), "utf8");
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
  try {
    await fs.writeFile(tmpPathFor(pathname), JSON.stringify(data, null, 2));
  } catch (err) {
    console.error(`[blob-storage] tmp write failed for ${pathname}:`, err);
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
  try {
    await fs.unlink(tmpPathFor(pathname));
  } catch {
    // not present — fine
  }
}
