import { NextRequest, NextResponse } from "next/server";
import { getProduct, updateProduct } from "@/lib/store/products";
import { createLesson } from "@/lib/store/lessons";
import { applyBrochureEdit } from "@/lib/scrapers/edit";
import type { BrochureData } from "@/lib/brochure-types";

export const runtime = "nodejs";
export const maxDuration = 60;

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
