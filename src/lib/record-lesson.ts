// Client-side helper for posting structured "rep correction" lessons.
// Fire-and-forget; we never block a save on the lesson recording, and
// we never surface lesson-API errors to the rep (the actual save already
// succeeded — lesson is a background improvement).

export type LessonRecord =
  | {
      kind: "image-fix";
      field: "heroImageUrl" | "imageUrl" | "decoImageUrl";
      colorName?: string;
      before: string;
      after: string;
    }
  | {
      kind: "rename";
      field: "trinityName" | "trinityTagline" | "description";
      before: string;
      after: string;
    }
  | {
      kind: "drag";
      blockId: string;
      before: { x: number; y: number } | null;
      after: { x: number; y: number };
    };

export function recordLesson(productId: string, body: LessonRecord): void {
  // Fire-and-forget. Swallow errors so a broken endpoint can never
  // block a rep's save. The lesson is purely additive — its absence
  // costs us a learning opportunity, not the rep's work.
  try {
    void fetch(`/api/products/${productId}/lessons`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // never throw
  }
}
