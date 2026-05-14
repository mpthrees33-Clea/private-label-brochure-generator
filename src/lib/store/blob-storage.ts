import { put, list, del } from "@vercel/blob";
import { promises as fs } from "fs";
import path from "path";

// Two-tier storage:
// - Production / Vercel: Vercel Blob (cross-instance, durable). The
//   BLOB_READ_WRITE_TOKEN env var is auto-injected when a Blob store
//   is attached to the Vercel project.
// - Local dev (no token): /tmp JSON files. Per-process; survives
//   warm-instance lifetimes only.
//
// All store data lives under the `store/` prefix in the blob, and the
// `addRandomSuffix: false` flag keeps the pathname stable so subsequent
// reads can find the file. @vercel/blob 0.27 overwrites in place on
// repeat puts; we don't need an explicit del-then-put.

const hasBlobToken = (): boolean => !!process.env.BLOB_READ_WRITE_TOKEN;

function tmpPathFor(pathname: string): string {
  return path.join("/tmp", "qfb-" + pathname.replace(/[/]/g, "_"));
}

export async function readJsonStore<T>(
  pathname: string,
  fallback: T,
): Promise<T> {
  if (hasBlobToken()) {
    try {
      const { blobs } = await list({ prefix: pathname, limit: 5 });
      const match = blobs.find((b) => b.pathname === pathname);
      if (!match) return fallback;
      const res = await fetch(match.url, { cache: "no-store" });
      if (!res.ok) return fallback;
      return (await res.json()) as T;
    } catch (err) {
      console.error(`[blob-storage] read failed for ${pathname}:`, err);
      return fallback;
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
  if (hasBlobToken()) {
    try {
      await put(pathname, JSON.stringify(data), {
        access: "public",
        addRandomSuffix: false,
        contentType: "application/json",
        cacheControlMaxAge: 0,
      });
      return;
    } catch (err) {
      // Some older blob stores reject overwrites — del then retry.
      const msg = err instanceof Error ? err.message : String(err);
      if (/exist|conflict|409/i.test(msg)) {
        try {
          const { blobs } = await list({ prefix: pathname, limit: 5 });
          const match = blobs.find((b) => b.pathname === pathname);
          if (match) await del(match.url);
          await put(pathname, JSON.stringify(data), {
            access: "public",
            addRandomSuffix: false,
            contentType: "application/json",
            cacheControlMaxAge: 0,
          });
          return;
        } catch (retryErr) {
          console.error(
            `[blob-storage] retry write failed for ${pathname}:`,
            retryErr,
          );
        }
      }
      console.error(`[blob-storage] write failed for ${pathname}:`, err);
    }
    return;
  }
  try {
    await fs.writeFile(tmpPathFor(pathname), JSON.stringify(data, null, 2));
  } catch {
    // /tmp may not be writable; in-memory cache still works in dev
  }
}
