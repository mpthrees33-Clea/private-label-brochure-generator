import { NextRequest, NextResponse } from "next/server";
import { renderBrochurePdf } from "@/lib/pdf/render";
import { getProduct } from "@/lib/store/products";
import {
  missingBrochureFields,
  MISSING_FIELD_LABELS,
} from "@/lib/brochure-quality";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

// GET /api/brochure/pdf
//   ?source=preview                         → hard-coded Kendall preview
//   ?source=scrape&url=<factoryUrl>         → scrape + render a real factory
//   ?source=<productId>                     → render a saved Product
export async function GET(req: NextRequest) {
  const source = req.nextUrl.searchParams.get("source") ?? "preview";
  const factoryUrl = req.nextUrl.searchParams.get("url");

  let renderPath: string;
  let filename: string;
  if (source === "preview") {
    renderPath = "/internal/brochure/preview";
    filename = "preview.pdf";
  } else if (source === "scrape") {
    if (!factoryUrl) {
      return NextResponse.json(
        { error: "?source=scrape requires ?url=<factoryUrl>" },
        { status: 400 },
      );
    }
    renderPath = `/internal/brochure/scrape?url=${encodeURIComponent(factoryUrl)}`;
    try {
      filename = new URL(factoryUrl).hostname.replace(/\./g, "-") + ".pdf";
    } catch {
      filename = "brochure.pdf";
    }
  } else {
    // Treat any other source as a saved product id. Enforce the
    // quality gate here too so a direct URL hit can't bypass the
    // disabled Download button.
    const product = await getProduct(source);
    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }
    const missing = missingBrochureFields(product);
    if (missing.length > 0) {
      return NextResponse.json(
        {
          error: `Cannot generate PDF — brochure is missing required fields: ${missing.map((m) => MISSING_FIELD_LABELS[m]).join(", ")}`,
          missingFields: missing,
        },
        { status: 422 },
      );
    }
    renderPath = `/internal/brochure/${encodeURIComponent(source)}`;
    filename = `${product.trinityName || source}.pdf`;
  }

  const host = req.headers.get("host") ?? "localhost:3000";
  const protocol = req.headers.get("x-forwarded-proto") ?? "https";
  const origin =
    process.env.VERCEL || host !== "localhost:3000"
      ? `${protocol}://${host}`
      : `http://${host}`;
  const target = `${origin}${renderPath}`;

  try {
    const pdfBytes = await renderBrochurePdf(target);
    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("PDF render failed:", err);
    // Browsers requesting application/pdf can't render JSON errors —
    // they show a blank/grey tab. Return an HTML error page so the rep
    // actually sees what failed and can go back / retry.
    const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>PDF generation failed</title><style>body{font:14px/1.5 system-ui,sans-serif;background:#0a0e14;color:#f5f9ff;padding:48px;max-width:640px;margin:0 auto}h1{color:#ff6b6b;font-size:18px;margin:0 0 8px}pre{background:#161e2a;border:1px solid #222e3f;border-radius:6px;padding:12px;font-size:12px;white-space:pre-wrap;word-break:break-word;color:#cfd8e6}a{color:#177AA9;text-decoration:none}a:hover{text-decoration:underline}.actions{margin-top:24px;display:flex;gap:12px}</style></head><body><h1>PDF generation failed</h1><p style="color:#9ba6b3">The brochure renderer hit an error. The product is still saved — only the PDF export failed.</p><pre>${escapeHtml(message)}</pre><div class="actions"><a href="javascript:history.back()">← Back</a><a href="${escapeAttr(req.headers.get("referer") ?? "/")}">Return to brochure</a></div></body></html>`;
    return new NextResponse(html, {
      status: 500,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
function escapeAttr(s: string): string {
  return escapeHtml(s);
}
