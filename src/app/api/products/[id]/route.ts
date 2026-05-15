import { NextRequest, NextResponse } from "next/server";
import {
  deleteProduct,
  getProduct,
  updateProduct,
} from "@/lib/store/products";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const product = await getProduct(params.id);
  if (!product) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ product });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const body = await req.json();
  const { mergeTechSpecs, mergeLayoutOverrides, ...patch } = body ?? {};
  try {
    // If the client asks to merge tech specs (spec-sheet URL backfill),
    // fold incoming values into the existing object instead of
    // replacing wholesale.
    if (mergeTechSpecs && patch.techSpecs && typeof patch.techSpecs === "object") {
      const existing = await getProduct(params.id);
      if (!existing) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      const merged = { ...existing.techSpecs };
      for (const [k, v] of Object.entries(patch.techSpecs)) {
        if (v != null && v !== "") {
          (merged as Record<string, string>)[k] = v as string;
        }
      }
      patch.techSpecs = merged;
    }
    // Layout-override merge — the drag editor PATCHes one block at a
    // time. Without merge semantics, each drag would wipe every other
    // block's saved position. A null value for a block deletes that
    // override (the "reset to default" button uses this).
    if (
      mergeLayoutOverrides &&
      patch.layoutOverrides &&
      typeof patch.layoutOverrides === "object"
    ) {
      const existing = await getProduct(params.id);
      if (!existing) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      const merged: Record<string, unknown> = { ...(existing.layoutOverrides ?? {}) };
      for (const [k, v] of Object.entries(patch.layoutOverrides)) {
        if (v === null) {
          delete merged[k];
        } else {
          merged[k] = v;
        }
      }
      patch.layoutOverrides = merged;
    }
    const product = await updateProduct(params.id, patch);
    return NextResponse.json({ product });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const status = message.includes("not found") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  await deleteProduct(params.id);
  return NextResponse.json({ ok: true });
}
