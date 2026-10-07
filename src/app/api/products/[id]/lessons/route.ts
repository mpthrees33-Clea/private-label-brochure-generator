import { NextRequest, NextResponse } from "next/server";
import { getProduct } from "@/lib/store/products";
import {
  createLesson,
  type LessonKind,
  type ImageFixDetails,
  type RenameDetails,
  type DragDetails,
} from "@/lib/store/lessons";
import type { BrochureData } from "@/lib/brochure-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/products/[id]/lessons — record a rep correction so future
// scrapes of the same factory learn from it.
//
// Body (one of):
//   { kind: "image-fix", field, colorName?, before, after }
//   { kind: "rename",    field, before, after }
//   { kind: "drag",      blockId, before, after }
//
// Unlike the edit-chat endpoint (POST /api/products/[id]/edit) which
// APPLIES a change, this endpoint only RECORDS one — the change has
// already been persisted by the PATCH that ran first.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const product = await getProduct(id);
  if (!product) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }
  const body = await req.json().catch(() => null);
  if (!body || typeof body.kind !== "string") {
    return NextResponse.json({ error: "kind is required" }, { status: 400 });
  }
  const kind = body.kind as LessonKind;

  const snapshot: BrochureData = {
    trinityName: product.trinityName,
    trinityTagline: product.trinityTagline,
    description: product.description,
    heroImageUrl: product.heroImageUrl,
    colors: product.colors,
    sizes: product.sizes,
    availability: product.availability,
    finishLegend: product.finishLegend,
    footnotes: product.footnotes,
    techSpecs: product.techSpecs,
  };

  let summary: string;
  let instruction: string;
  let details: ImageFixDetails | RenameDetails | DragDetails;

  switch (kind) {
    case "image-fix": {
      const { field, colorName, before, after } = body as Partial<ImageFixDetails>;
      if (
        (field !== "heroImageUrl" &&
          field !== "imageUrl" &&
          field !== "decoImageUrl") ||
        typeof after !== "string" ||
        !after.trim()
      ) {
        return NextResponse.json(
          { error: "image-fix requires field + non-empty after" },
          { status: 400 },
        );
      }
      // Only record when the scraper actually missed it. If the rep is
      // just swapping one valid image URL for another (taste / quality
      // call), that's not a learnable scraper failure.
      const beforeStr = typeof before === "string" ? before : "";
      if (beforeStr.trim() !== "") {
        return NextResponse.json({ skipped: "before was non-empty" });
      }
      details = { field, colorName, before: "", after };
      const host = safeHost(product.factoryUrl);
      const what =
        field === "heroImageUrl"
          ? "the hero / lifestyle image"
          : field === "decoImageUrl"
            ? `the decorative swatch image for color "${colorName}"`
            : `the swatch image for color "${colorName}"`;
      summary = `On ${host || product.factory}, the AI scraper failed to find ${what}. The rep manually provided one. On this domain, look harder at image markup (srcset, data-src, data-lazy-src, lazy-load wrappers, embedded gallery widgets). Do not return empty imageUrl for visible colors — flag the page as JS-rendered if you genuinely cannot find images.`;
      instruction = `[image-fix] ${what}: empty → ${truncate(after, 120)}`;
      break;
    }
    case "rename": {
      const { field, before, after } = body as Partial<RenameDetails>;
      if (
        (field !== "trinityName" &&
          field !== "trinityTagline" &&
          field !== "description") ||
        typeof before !== "string" ||
        typeof after !== "string" ||
        before === after
      ) {
        return NextResponse.json(
          { error: "rename requires field + before + after (and they must differ)" },
          { status: 400 },
        );
      }
      // Skip the placeholder Trinity name — that's not a real correction.
      if (field === "trinityName" && (before === "" || before === "rename-me")) {
        return NextResponse.json({ skipped: "placeholder name, not a learnable change" });
      }
      details = { field, before, after };
      const host = safeHost(product.factoryUrl);
      summary =
        field === "description"
          ? `On ${host || product.factory}, the rep rewrote the AI's description. Old: "${truncate(before, 80)}" → New: "${truncate(after, 120)}". Match this voice/style for products from this factory.`
          : `On ${host || product.factory}, the AI suggested ${field}="${truncate(before, 60)}"; the rep changed it to "${truncate(after, 60)}". Reps may prefer this style on this domain — be flexible, the rep's choice is canonical.`;
      instruction = `[rename] ${field}: ${truncate(before, 60)} → ${truncate(after, 60)}`;
      break;
    }
    case "drag": {
      const { blockId, before, after } = body as Partial<DragDetails>;
      if (
        typeof blockId !== "string" ||
        !blockId.trim() ||
        !after ||
        typeof after.x !== "number" ||
        typeof after.y !== "number"
      ) {
        return NextResponse.json(
          { error: "drag requires blockId + after.{x,y}" },
          { status: 400 },
        );
      }
      details = { blockId, before: before ?? null, after };
      const host = safeHost(product.factoryUrl);
      summary = `[drag] ${blockId} → (${Math.round(after.x)}, ${Math.round(after.y)}) on ${host || product.factory}`;
      instruction = summary;
      break;
    }
    default:
      return NextResponse.json(
        { error: `unknown kind "${kind}"` },
        { status: 400 },
      );
  }

  const lesson = await createLesson({
    productId: product.id,
    factoryUrl: product.factoryUrl,
    factory: product.factory,
    instruction,
    summary,
    before: snapshot,
    after: snapshot,
    kind,
    details,
  });

  return NextResponse.json({ lesson });
}

function safeHost(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
