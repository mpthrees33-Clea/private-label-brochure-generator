import { NextRequest, NextResponse } from "next/server";
import { readUpload } from "@/lib/store/uploads";

export const runtime = "nodejs";
// Static-ish content: cacheable, but Next's default for route handlers
// is to mark them dynamic. We explicitly opt out of the cache so that
// streaming binaries from disk doesn't fail Next's "JSON-serializable"
// caching assumptions.
export const dynamic = "force-dynamic";

// Serve a previously-uploaded image from disk. The filename allowlist
// in readUpload() rejects anything that doesn't match the
// 16-hex + safe-ext shape, so this endpoint can't be coerced into
// reading arbitrary files from the uploads dir.
export async function GET(
  _req: NextRequest,
  { params }: { params: { filename: string } },
) {
  const result = await readUpload(params.filename);
  if (!result) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return new NextResponse(new Uint8Array(result.buffer), {
    status: 200,
    headers: {
      "Content-Type": result.contentType,
      // Filenames are content-addressed-ish (random per upload), so the
      // immutable cache directive is safe — a given URL never changes.
      "Cache-Control": "public, max-age=86400, s-maxage=604800, immutable",
      "Content-Length": String(result.buffer.byteLength),
    },
  });
}
