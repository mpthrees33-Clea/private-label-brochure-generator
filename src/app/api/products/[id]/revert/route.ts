import { NextRequest, NextResponse } from "next/server";
import { getProduct, updateProduct } from "@/lib/store/products";
import {
  deleteLesson,
  getLatestLessonForProduct,
} from "@/lib/store/lessons";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/products/[id]/revert — undo the most-recent edit by
// restoring the lesson's `before` snapshot and deleting the lesson
// itself. The corresponding "rule" is also removed from the lessons
// store so the AI doesn't continue learning from a reverted instruction.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const product = await getProduct(id);
  if (!product) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }
  const lesson = await getLatestLessonForProduct(id);
  if (!lesson) {
    return NextResponse.json(
      { error: "No edits to undo." },
      { status: 404 },
    );
  }
  const restored = await updateProduct(id, lesson.before);
  await deleteLesson(lesson.id);
  return NextResponse.json({
    product: restored,
    revertedInstruction: lesson.instruction,
  });
}
