import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Validate a candidate swatch URL by issuing a HEAD (with a GET fallback
// for hosts that don't honor HEAD). Returns { ok: true } only if the
// response is 2xx and looks like an image. Used by the swatch URL
// pattern-detect flow — we never want to silently save a 404 just
// because the pattern was plausible.
//
// We avoid downloading large images: HEAD first, and if we must fall
// back to GET we abort after the first byte arrives (the Content-Type
// header is already populated by then).
export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) {
    return NextResponse.json({ ok: false, reason: "missing url" }, { status: 400 });
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return NextResponse.json({ ok: false, reason: "invalid url" }, { status: 400 });
  }
  if (!/^https?:$/.test(parsed.protocol)) {
    return NextResponse.json({ ok: false, reason: "non-http(s)" }, { status: 400 });
  }
  const userAgent =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

  try {
    const head = await fetch(parsed.toString(), {
      method: "HEAD",
      headers: { "User-Agent": userAgent, Accept: "image/*,*/*;q=0.8" },
      redirect: "follow",
    });
    if (head.ok) {
      const ct = head.headers.get("content-type") ?? "";
      if (ct.startsWith("image/")) {
        return NextResponse.json({ ok: true, contentType: ct });
      }
      // Some hosts return text/html for HEAD even when GET would 200
      // with an image — fall through to GET.
    } else if (head.status !== 405 && head.status !== 501) {
      return NextResponse.json({ ok: false, reason: `HEAD ${head.status}` });
    }
  } catch {
    // network error on HEAD — try GET as a fallback
  }

  // GET with abort: we only need the response headers, not the body.
  const controller = new AbortController();
  try {
    const res = await fetch(parsed.toString(), {
      method: "GET",
      headers: { "User-Agent": userAgent, Accept: "image/*,*/*;q=0.8" },
      signal: controller.signal,
      redirect: "follow",
    });
    if (!res.ok) {
      controller.abort();
      return NextResponse.json({ ok: false, reason: `GET ${res.status}` });
    }
    const ct = res.headers.get("content-type") ?? "";
    controller.abort();
    if (!ct.startsWith("image/")) {
      return NextResponse.json({ ok: false, reason: `content-type ${ct || "(missing)"}` });
    }
    return NextResponse.json({ ok: true, contentType: ct });
  } catch (err) {
    return NextResponse.json({
      ok: false,
      reason: err instanceof Error ? err.message : "fetch failed",
    });
  }
}
