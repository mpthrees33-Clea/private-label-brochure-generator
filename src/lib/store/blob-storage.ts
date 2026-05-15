import { put, list, del } from "@vercel/blob";
import { promises as fs } from "fs";
import path from "path";

// Storage strategy:
// - Production (Vercel): Vercel Blob, mandatory. If BLOB_READ_WRITE_TOKEN
//   is missing in production we THROW loudly. Silently falling back to
//   /tmp on Vercel is invisible-broken — saves succeed on instance A,
//   then GETs land on instance B which has no /tmp data → mystery 404.
// - Local dev (no token, not on Vercel): /tmp JSON files.
//
// @vercel/blob 0.27 doesn't have `allowOverwrite`, so we always
// delete-then-put when writing. Idempotent and safe.

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
        "Open the Vercel project → Storage → Create → Blob, then redeploy. " +
        "Until then, saves cannot persist across requests.",
    );
  }
}

function tmpPathFor(pathname: string): string {
  return path.join("/tmp", "qfb-" + pathname.replace(/[/]/g, "_"));
}

export async function readJsonStore<T>(
  pathname: string,
  fallback: T,
): Promise<T> {
  const s = getStorageStatus();
  if (s.productionMissingToken) {
    // Don't read from /tmp in prod-without-token. Reading is fine —
    // we don't want to leak whatever orphaned data exists on whichever
    // instance happens to handle this request.
    throw new Error(
      "Storage not configured: BLOB_READ_WRITE_TOKEN missing in production.",
    );
  }
  if (s.mode === "blob") {
    try {
      const { blobs } = await list({ prefix: pathname, limit: 5 });
      const match = blobs.find((b) => b.pathname === pathname);
      if (!match) return fallback;
      const res = await fetch(match.url, { cache: "no-store" });
      if (!res.ok) return fallback;
      return (await res.json()) as T;
    } catch (err) {
      console.error(`[blob-storage] read failed for ${pathname}:`, err);
      throw err;
    }
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
    // Always delete any existing blob at this pathname first — older
    // @vercel/blob versions reject overwrites and we can't rely on a
    // single put working idempotently.
    try {
      const { blobs } = await list({ prefix: pathname, limit: 5 });
      const match = blobs.find((b) => b.pathname === pathname);
      if (match) {
        await del(match.url).catch(() => {});
      }
    } catch (err) {
      console.error(`[blob-storage] pre-write list/del failed:`, err);
    }
    try {
      await put(pathname, JSON.stringify(data), {
        access: "public",
        addRandomSuffix: false,
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
      const { blobs } = await list({ prefix: pathname, limit: 5 });
      const match = blobs.find((b) => b.pathname === pathname);
      if (match) await del(match.url);
    } catch (err) {
      console.error(`[blob-storage] delete failed for ${pathname}:`, err);
    }
    return;
  }
  try {
    await fs.unlink(tmpPathFor(pathname));
  } catch {
    // not present — fine
  }
}
