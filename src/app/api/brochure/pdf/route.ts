import { NextRequest, NextResponse } from "next/server";
import { buildBrochureDocument } from "@/lib/pdf/document";
import { renderBrochurePdf } from "@/lib/pdf/render";
import type { BrochureData } from "@/lib/brochure-types";
import { scrapeProduct } from "@/lib/scrapers";
import { scrapedToBrochure } from "@/lib/scraped-to-brochure";
import { findByFactoryUrl, getProduct, listProducts } from "@/lib/store/products";
import { chooseTrinityName } from "@/lib/trinity-names";
import { withFactoryLayoutDefaults } from "@/lib/store/factory-layout-defaults";
import {
  missingBrochureFields,
  MISSING_FIELD_LABELS,
} from "@/lib/brochure-quality";
import { KENDALL_SAMPLE } from "@/lib/sample-data";
import { brochurePdfFilename } from "@/lib/pdf/filename";
import type { Product } from "@/lib/store/types";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

// GET /api/brochure/pdf
//   ?source=preview                         → hard-coded Kendall preview
//   ?source=scrape&url=<factoryUrl>         → saved product, or a fresh scrape
//   ?source=<productId>                     → render a saved Product
//
// The PDF is rendered from in-memory HTML (React → setContent). Chromium
// does not request this deployment, so the route works on Vercel (no
// process listens on 127.0.0.1, and Deployment Protection would otherwise
// challenge the browser) and behind nginx basic auth on the VPS.
export async function GET(req: NextRequest) {
  const source = req.nextUrl.searchParams.get("source") ?? "preview";
  const factoryUrl = req.nextUrl.searchParams.get("url");

  try {
    const brochure = await resolveBrochure(source, factoryUrl);
    if (brochure instanceof NextResponse) return brochure;
    const html = await buildBrochureDocument(brochure.data, brochure.factoryName);
    const pdfBytes = await renderBrochurePdf(html);
    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${brochure.filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("PDF render failed:", err);
    const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>PDF generation failed</title><style>body{font:14px/1.5 system-ui,sans-serif;background:#0a0e14;color:#f5f9ff;padding:48px;max-width:640px;margin:0 auto}h1{color:#ff6b6b;font-size:18px;margin:0 0 8px}pre{background:#161e2a;border:1px solid #222e3f;border-radius:6px;padding:12px;font-size:12px;white-space:pre-wrap;word-break:break-word;color:#cfd8e6}a{color:#177AA9;text-decoration:none}a:hover{text-decoration:underline}.actions{margin-top:24px;display:flex;gap:12px}</style></head><body><h1>PDF generation failed</h1><p style="color:#9ba6b3">The brochure renderer hit an error. The product is still saved — only the PDF export failed.</p><pre>${escapeHtml(message)}</pre><div class="actions"><a href="javascript:history.back()">← Back</a><a href="${escapeAttr(req.headers.get("referer") ?? "/")}">Return to brochure</a></div></body></html>`;
    return new NextResponse(html, {
      status: 500,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }
}

async function resolveBrochure(
  source: string,
  factoryUrl: string | null,
): Promise<
  | { data: BrochureData; factoryName?: string; filename: string }
  | NextResponse
> {
  if (source === "preview") {
    return { data: KENDALL_SAMPLE, filename: "preview.pdf" };
  }

  if (source === "scrape") {
    if (!factoryUrl) {
      return NextResponse.json(
        { error: "?source=scrape requires ?url=<factoryUrl>" },
        { status: 400 },
      );
    }
    const existing = await findByFactoryUrl(factoryUrl);
    if (existing) return renderSaved(existing);
    const scraped = await scrapeProduct(factoryUrl);
    const data = scrapedToBrochure(scraped);
    const taken = (await listProducts()).map((product) => product.trinityName);
    data.trinityName = chooseTrinityName(data.trinityName, taken);
    let filename = "brochure.pdf";
    try {
      filename = safeFilename(new URL(factoryUrl).hostname.replace(/\./g, "-") + ".pdf");
    } catch {
      filename = "brochure.pdf";
    }
    return { data, factoryName: scraped.factoryName, filename };
  }

  const product = await getProduct(source);
  if (!product) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }
  return renderSaved(product);
}

async function renderSaved(
  product: Product,
): Promise<
  | { data: BrochureData; factoryName?: string; filename: string }
  | NextResponse
> {
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
  const withLayout = await withFactoryLayoutDefaults(product);
  return {
    data: withLayout,
    factoryName: product.factoryName,
    filename: brochurePdfFilename(product.trinityName, product.id),
  };
}

function safeFilename(name: string): string {
  const cleaned = name.replace(/[\r\n"\\]/g, "").trim();
  return cleaned || "brochure.pdf";
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
