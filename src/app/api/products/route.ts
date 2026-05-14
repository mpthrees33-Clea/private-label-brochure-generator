import { NextRequest, NextResponse } from "next/server";
import { createProduct, listProducts } from "@/lib/store/products";

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
  try {
    const product = await createProduct(body);
    return NextResponse.json({ product }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
