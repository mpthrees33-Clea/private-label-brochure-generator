import { NextResponse } from "next/server";
import {
  getStorageStatus,
  readJsonStore,
  writeJsonStore,
  deleteJsonStore,
} from "@/lib/store/blob-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/debug/storage — verify storage mode + perform a read/write/
// delete round-trip so the rep can confirm Vercel Blob is wired up.
export async function GET() {
  const status = getStorageStatus();
  const pathname = "store/__healthcheck.json";
  const payload = { writtenAt: new Date().toISOString(), check: "ok" };
  let roundTrip: {
    write?: string;
    read?: string;
    cleanup?: string;
    readBack?: unknown;
  } = {};
  try {
    await writeJsonStore(pathname, payload);
    roundTrip.write = "ok";
    const back = await readJsonStore<typeof payload | null>(pathname, null);
    roundTrip.readBack = back;
    roundTrip.read = back ? "ok" : "missing";
    await deleteJsonStore(pathname);
    roundTrip.cleanup = "ok";
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { status, roundTrip, error: msg },
      { status: 500 },
    );
  }
  return NextResponse.json({ status, roundTrip });
}
