import { NextRequest, NextResponse } from "next/server";
import { getProduct, updateProduct } from "@/lib/store/products";
import { createLesson } from "@/lib/store/lessons";
import { applyBrochureEdit } from "@/lib/scrapers/edit";
import type { BrochureData } from "@/lib/brochure-types";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

// POST /api/products/[id]/edit { instruction } → apply a plain-English
// edit to the brochure and persist a Lesson for future scrapes.
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const product = await getProduct(params.id);
  if (!product) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }
  const body = await req.json().catch(() => null);
  const instruction = body?.instruction;
  if (typeof instruction !== "string" || !instruction.trim()) {
    return NextResponse.json(
      { error: "instruction is required" },
      { status: 400 },
    );
  }

  // Snapshot just the BrochureData fields (drop product metadata).
  const before: BrochureData = {
    trinityName: product.trinityName,
    trinityTagline: product.trinityTagline,
    description: product.description,
    heroImageUrl: product.heroImageUrl,
    colors: product.colors,
    sizes: product.sizes,
    availability: product.availability,
    finishLegend: product.finishLegend,
    footnotes: product.footnotes,
    techSpecs: product.techSpecs,
  };

  let result;
  try {
    result = await applyBrochureEdit(before, instruction);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  // Detect no-op edits. If the AI returned identical data (typically
  // because the instruction was a layout / visual request that can't
  // be applied via BrochureData), don't save a misleading "rule" to
  // the lessons store and tell the rep what happened.
  const noopChange = isStructurallyEqual(before, result.data);
  if (noopChange) {
    return NextResponse.json(
      {
        product,
        noop: true,
        changeSummary:
          "No data changes applied. The chat edits brochure DATA (description, names, colors, sizes, tech specs) — not visual layout. Layout/positioning of swatches, headers, etc. is fixed by the renderer. Try rephrasing as a data change, or ask the engineer to adjust the template.",
      },
      { status: 200 },
    );
  }

  const updated = await updateProduct(params.id, result.data);

  await createLesson({
    productId: product.id,
    factoryUrl: product.factoryUrl,
    factory: product.factory,
    instruction,
    summary: result.changeSummary,
    before,
    after: result.data,
  });

  return NextResponse.json({
    product: updated,
    changeSummary: result.changeSummary,
  });
}

function isStructurallyEqual(a: unknown, b: unknown): boolean {
  // Cheap deep-equality via canonical JSON. BrochureData is tree-
  // shaped and serializable, no Date/Map/Set fields to worry about.
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}
