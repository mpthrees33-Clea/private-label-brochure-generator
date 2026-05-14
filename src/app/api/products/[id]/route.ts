import { NextRequest, NextResponse } from "next/server";
import {
  deleteProduct,
  getProduct,
  updateProduct,
} from "@/lib/store/products";

export const runtime = "nodejs";

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
  const patch = await req.json();
  try {
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
