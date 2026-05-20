import { NextRequest, NextResponse } from "next/server";
import { saveUpload } from "@/lib/store/uploads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Accept a single image file (multipart/form-data, field name "file"),
// persist it under the configured uploads dir, and return its
// same-origin URL. Used by the swatch + hero editors so reps on iOS —
// who can't easily copy an image URL out of Safari — can paste the
// actual image bytes or pick from the photo library instead.
export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  if (!form) {
    return NextResponse.json(
      { ok: false, error: "expected multipart/form-data" },
      { status: 400 },
    );
  }
  const file = form.get("file");
  if (!file || typeof file === "string") {
    return NextResponse.json(
      { ok: false, error: "file field required" },
      { status: 400 },
    );
  }
  try {
    const arr = await file.arrayBuffer();
    const buf = Buffer.from(arr);
    const ct = (file as File).type || "application/octet-stream";
    const saved = await saveUpload(buf, ct);
    return NextResponse.json({ ok: true, url: saved.url });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "upload failed" },
      { status: 400 },
    );
  }
}
