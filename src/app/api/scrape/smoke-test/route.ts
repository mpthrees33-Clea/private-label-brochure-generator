import { NextRequest, NextResponse } from "next/server";
import { fetchAndCleanPage } from "@/lib/scrapers/fetch";
import { scrapeWithAI } from "@/lib/scrapers/ai";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

// Curated single-URL smoke targets, one per supported factory.
// GET /api/scrape/smoke-test?factory=ragno → run one factory
// GET /api/scrape/smoke-test                → list available targets
const TARGETS: Record<string, string> = {
  ragno: "https://www.ragnousa.com/collections/forum-series/",
  "atlas-concorde": "https://www.atlasconcorde.com/en/ac-collection/log",
  "florida-tile": "https://floridatile.com/products/artecrete/",
  panaria: "https://www.panaria.us/products/collection/moondance",
};

export async function GET(req: NextRequest) {
  const factory = req.nextUrl.searchParams.get("factory");
  if (!factory) {
    return NextResponse.json({
      usage: "GET /api/scrape/smoke-test?factory=<key>",
      targets: TARGETS,
    });
  }
  const url = TARGETS[factory];
  if (!url) {
    return NextResponse.json(
      { error: `Unknown factory "${factory}"`, available: Object.keys(TARGETS) },
      { status: 400 },
    );
  }
  const t0 = Date.now();
  try {
    const page = await fetchAndCleanPage(url);
    const fetchedMs = Date.now() - t0;
    const product = await scrapeWithAI(url, page.cleanedHtml, page.title);
    return NextResponse.json({
      ok: true,
      factory,
      url,
      fetchedMs,
      totalMs: Date.now() - t0,
      htmlChars: page.cleanedHtml.length,
      product: {
        factoryName: product.factoryName,
        suggestedTagline: product.suggestedTagline,
        descriptionLength: product.suggestedDescription.length,
        heroImageUrl: product.heroImageUrl,
        colorCount: product.colors.length,
        sizeCount: product.sizes.length,
        sampleColor: product.colors[0],
        sampleSize: product.sizes[0],
        techSpecKeys: Object.keys(product.techSpecs),
      },
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        factory,
        url,
        elapsedMs: Date.now() - t0,
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}
