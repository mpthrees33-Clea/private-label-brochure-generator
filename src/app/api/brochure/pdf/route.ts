import { NextRequest, NextResponse } from "next/server";
import { renderBrochurePdf } from "@/lib/pdf/render";

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
    // Treat any other source as a saved product id.
    renderPath = `/internal/brochure/${encodeURIComponent(source)}`;
    filename = `${source}.pdf`;
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
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
