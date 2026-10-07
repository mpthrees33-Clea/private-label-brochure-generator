// Server-side image fetch shared by the browser proxy and the PDF
// renderer. Factory CDNs often block hotlinking, so both paths fetch
// with a browser-like User-Agent and retry once without a Referer.

const SSRF_HOST_DENYLIST =
  /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.|::1$)/i;

const IMAGE_UA =
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
      Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
    },
    {
      "User-Agent": IMAGE_UA,
      Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
    },
  ];
  for (const headers of attempts) {
    try {
      const upstream = await fetch(parsed.toString(), {
        headers,
        redirect: "follow",
        signal: AbortSignal.timeout(12000),
      });
      if (!upstream.ok) continue;
      const bytes = Buffer.from(await upstream.arrayBuffer());
      if (bytes.byteLength === 0) continue;
      return {
        bytes,
        contentType: upstream.headers.get("content-type") ?? "",
      };
    } catch {
      // try the next header set
    }
  }
  return null;
}
