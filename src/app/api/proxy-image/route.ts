import { NextRequest, NextResponse } from "next/server";
import { sniffImageMime } from "@/lib/image-sniff";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Server-side image proxy. Factory CDNs commonly block cross-origin
// image requests (hotlink protection / strict referer policies), so
// the browser can't load swatch URLs directly. The proxy fetches the
// image server-to-server (no CORS, our choice of headers) and serves
// it back from our origin. The browser sees a same-origin URL and
// loads it normally. Aggressively cached at the CDN edge so warmed-up
// requests are fast.

const SSRF_HOST_DENYLIST = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.|::1$)/i;

export async function GET(req: NextRequest) {
  const target = req.nextUrl.searchParams.get("url");
  if (!target) {
    return NextResponse.json({ error: "url required" }, { status: 400 });
  }
  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return NextResponse.json({ error: "invalid url" }, { status: 400 });
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return NextResponse.json({ error: "protocol not allowed" }, { status: 400 });
  }
  if (SSRF_HOST_DENYLIST.test(parsed.hostname)) {
    return NextResponse.json({ error: "host denied" }, { status: 403 });
  }

  try {
    const buf = await fetchImageBytes(parsed);
    if (!buf) {
      return NextResponse.json({ error: "Upstream image fetch failed" }, { status: 502 });
    }
    const sniffed = sniffImageMime(new Uint8Array(buf.bytes));
    const headerType = buf.contentType.toLowerCase();
    const contentType = headerType.startsWith("image/")
      ? buf.contentType
      : sniffed;
    if (!contentType) {
      return NextResponse.json(
        { error: `Not an image (Content-Type: ${buf.contentType || "unknown"})` },
        { status: 415 },
      );
    }
    return new NextResponse(buf.bytes, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        // 1 day in browser, 7 days at CDN.
        "Cache-Control": "public, max-age=86400, s-maxage=604800, immutable",
        "Content-Length": String(buf.bytes.byteLength),
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `Fetch failed: ${msg}` }, { status: 502 });
  }
}

const IMAGE_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

async function fetchImageBytes(
  parsed: URL,
): Promise<{ bytes: ArrayBuffer; contentType: string } | null> {
  // Some CDNs 403 a same-origin Referer and some 403 the absence of one.
  // Try with the image origin as Referer, then once without.
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
      const bytes = await upstream.arrayBuffer();
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
