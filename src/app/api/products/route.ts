import { NextRequest, NextResponse } from "next/server";
import { createProduct, getProduct, listProducts } from "@/lib/store/products";
import {
  missingBrochureFields,
  MISSING_FIELD_LABELS,
} from "@/lib/brochure-quality";
import type { BrochureData } from "@/lib/brochure-types";

export const runtime = "nodejs";

export async function GET() {
  const products = await listProducts();
  return NextResponse.json({ products });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  // Quality gate — refuse to persist an incomplete brochure. Same rules
  // the preview page enforces client-side; this is the server fallback.
  const missing = missingBrochureFields(body as BrochureData);
  if (missing.length > 0) {
    return NextResponse.json(
      {
        error: `Missing required fields: ${missing.map((m) => MISSING_FIELD_LABELS[m]).join(", ")}`,
        missingFields: missing,
      },
      { status: 422 },
    );
  }
  try {
    const product = await createProduct(body);
    // Read-after-write sanity check: confirm the new product can be
    // fetched. If this returns null we know the persistence failed even
    // though createProduct didn't throw — better to fail loudly here
    // than to redirect the rep to /products/<id> and 404.
    const verified = await getProduct(product.id);
    if (!verified) {
      return NextResponse.json(
        {
          error:
            "Saved but the product is not visible on read. Storage is likely not configured — visit /api/debug/storage.",
        },
        { status: 500 },
      );
    }
    return NextResponse.json({ product: verified }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
