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
  { params }: { params: { id: string } },
) {
  const product = await getProduct(params.id);
  if (!product) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }
  const lesson = await getLatestLessonForProduct(params.id);
  if (!lesson) {
    return NextResponse.json(
      { error: "No edits to undo." },
      { status: 404 },
    );
  }
  const restored = await updateProduct(params.id, lesson.before);
  await deleteLesson(lesson.id);
  return NextResponse.json({
    product: restored,
    revertedInstruction: lesson.instruction,
  });
}
