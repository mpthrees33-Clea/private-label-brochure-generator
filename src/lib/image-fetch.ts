// Server-side image fetch shared by the browser proxy and the PDF
// renderer. Factory CDNs often block hotlinking, so both paths fetch
// with a browser-like User-Agent and retry without a Referer.
//
// Use undici directly. Next replaces global fetch, and that wrapper is
// a poor fit for large binary CDN responses. An empty or failed fetch
// used to be swapped for a 1×1 GIF in the brochure PDF.

import { fetch as undiciFetch } from "undici";

const SSRF_HOST_DENYLIST =
  /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.|::1$)/i;

export const IMAGE_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export function isDeniedImageHost(hostname: string): boolean {
  return SSRF_HOST_DENYLIST.test(hostname);
}

export async function fetchRemoteImage(
  target: string,
): Promise<{ bytes: Buffer; contentType: string } | null> {
  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  if (isDeniedImageHost(parsed.hostname)) return null;

  const attempts: Array<Record<string, string>> = [
    {
      "User-Agent": IMAGE_UA,
      Referer: parsed.origin + "/",
      Accept: "image/jpeg,image/png,image/webp,image/*;q=0.8,*/*;q=0.5",
    },
    {
      "User-Agent": IMAGE_UA,
      Accept: "image/jpeg,image/png,image/webp,image/*;q=0.8,*/*;q=0.5",
    },
    {
      "User-Agent": IMAGE_UA,
      Referer: parsed.origin + "/",
      Accept: "image/jpeg,image/png,image/webp,image/*;q=0.8,*/*;q=0.5",
    },
  ];
  let lastStatus = 0;
  let lastError = "";
  for (let i = 0; i < attempts.length; i++) {
    if (i > 0) await new Promise((resolve) => setTimeout(resolve, 200));
    try {
      const upstream = await undiciFetch(parsed.toString(), {
        headers: attempts[i],
        redirect: "follow",
        signal: AbortSignal.timeout(15000),
      });
      lastStatus = upstream.status;
      if (!upstream.ok) {
        await upstream.body?.cancel().catch(() => {});
        continue;
      }
      const bytes = Buffer.from(await upstream.arrayBuffer());
      if (bytes.byteLength === 0) {
        lastError = "empty body";
        continue;
      }
      return {
        bytes,
        contentType: upstream.headers.get("content-type") ?? "",
      };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }
  console.error(
    `image fetch failed host=${parsed.hostname} status=${lastStatus} error=${lastError || "no image"} url=${parsed.toString().slice(0, 240)}`,
  );
  return null;
}
