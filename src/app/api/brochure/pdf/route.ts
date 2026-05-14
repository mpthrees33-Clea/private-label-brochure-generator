import { NextRequest, NextResponse } from "next/server";
import { renderBrochurePdf } from "@/lib/pdf/render";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

// GET /api/brochure/pdf?source=preview
// In future: ?source=<productId>. For now, only the hard-coded
// preview is wired up; CRUD lands in task #4.
export async function GET(req: NextRequest) {
  const source = req.nextUrl.searchParams.get("source") ?? "preview";
  if (source !== "preview") {
    return NextResponse.json(
      { error: "Only ?source=preview is supported right now." },
      { status: 400 },
    );
  }

  const host = req.headers.get("host") ?? "localhost:3000";
  const protocol = req.headers.get("x-forwarded-proto") ?? "https";
  const origin =
    process.env.VERCEL || host !== "localhost:3000"
      ? `${protocol}://${host}`
      : `http://${host}`;
  const target = `${origin}/internal/brochure/${source}`;

  try {
    const pdfBytes = await renderBrochurePdf(target);
    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${source}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("PDF render failed:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
