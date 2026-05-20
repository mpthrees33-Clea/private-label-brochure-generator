import { NextRequest, NextResponse } from "next/server";
import { scrapeFromPdfWithAI } from "@/lib/scrapers/ai";
import { scrapedToBrochure } from "@/lib/scraped-to-brochure";
import { createProduct } from "@/lib/store/products";

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";

const MAX_PDF_BYTES = 32 * 1024 * 1024;

// POST /api/scrape/pdf  multipart/form-data { file: <pdf> }
// New-brochure path for products that don't have a public URL yet —
// factories often send a spec PDF for unreleased lines. Mirrors the
// GET /internal/brochure/scrape?url=... server flow, just with a PDF
// document as the AI input instead of cleaned HTML. Returns { id }
// so the client can navigate to /products/[id] for editing.
export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  if (!form) {
    return NextResponse.json(
      { error: "expected multipart/form-data" },
      { status: 400 },
    );
  }
  const file = form.get("file");
  if (!file || typeof file === "string") {
    return NextResponse.json(
      { error: "file field required" },
      { status: 400 },
    );
  }
  const f = file as File;
  const ct = (f.type || "").toLowerCase();
  if (!ct.includes("application/pdf") && !f.name.toLowerCase().endsWith(".pdf")) {
    return NextResponse.json(
      { error: "only PDF uploads are supported here" },
      { status: 415 },
    );
  }
  const bytes = await f.arrayBuffer();
  if (bytes.byteLength === 0) {
    return NextResponse.json({ error: "empty file" }, { status: 400 });
  }
  if (bytes.byteLength > MAX_PDF_BYTES) {
    return NextResponse.json(
      { error: `PDF too large (>${MAX_PDF_BYTES / (1024 * 1024)}MB)` },
      { status: 413 },
    );
  }

  try {
    const scraped = await scrapeFromPdfWithAI(bytes, f.name);
    const data = scrapedToBrochure(scraped);
    if (!data.trinityName || data.trinityName.trim() === "") {
      data.trinityName = "rename-me";
    }
    const created = await createProduct({
      ...data,
      factory: scraped.factory,
      factoryName: scraped.factoryName,
      factoryUrl: scraped.factoryUrl,
    });
    return NextResponse.json({ id: created.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
