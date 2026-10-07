import { NextRequest, NextResponse } from "next/server";
import { fetchRemoteImage, isDeniedImageHost } from "@/lib/image-fetch";
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
  if (isDeniedImageHost(parsed.hostname)) {
    return NextResponse.json({ error: "host denied" }, { status: 403 });
  }

  try {
    const buf = await fetchRemoteImage(parsed.toString());
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
    return new NextResponse(new Uint8Array(buf.bytes), {
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

