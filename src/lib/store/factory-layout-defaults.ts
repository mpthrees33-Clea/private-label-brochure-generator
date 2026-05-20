import type { BlockPosition, LayoutOverrides } from "../brochure-types";
import { dragLessonsForFactory, type Lesson, type DragDetails } from "./lessons";

// Min number of drags on the SAME factory + block before we treat the
// cluster as a learned default. Below this, layout changes are treated
// as one-offs and never propagate to other products.
const MIN_DRAGS_TO_PROMOTE = 3;

// Spread (max - min) tolerance in design pixels for clustering. Drags
// within this range on both axes are considered "the same" and their
// median becomes the default. Wider spreads mean reps disagree, and
// we leave the default unchanged.
const CLUSTER_SPREAD_PX = 40;

/**
 * For a given factory host, return the per-block layout overrides
 * that should be applied as defaults for NEW products from that factory.
 *
 * Per-product `layoutOverrides` (the rep's explicit positioning on this
 * product) ALWAYS win — these factory defaults are only the starting
 * position before the rep touches anything.
 */
export async function factoryLayoutDefaultsFor(
  factoryHost: string,
): Promise<LayoutOverrides> {
  if (!factoryHost) return {};
  const drags = await dragLessonsForFactory(factoryHost);
  if (drags.length === 0) return {};

  // Group by blockId, then keep the most recent N drags per block so
  // an old quirky drag doesn't dominate after the rep has corrected.
  const byBlock = new Map<string, DragDetails[]>();
  for (const l of drags) {
    if (!isDragLesson(l)) continue;
    const arr = byBlock.get(l.details.blockId) ?? [];
    arr.push(l.details);
    byBlock.set(l.details.blockId, arr);
  }

  const out: LayoutOverrides = {};
  for (const [blockId, list] of byBlock.entries()) {
    // Lessons came back newest-first from listLessons; keep up to the
    // most recent 8 to bound the cluster window.
    const recent = list.slice(0, 8).map((d) => d.after);
    if (recent.length < MIN_DRAGS_TO_PROMOTE) continue;
    const cluster = pickClusterByMedian(recent, CLUSTER_SPREAD_PX);
    if (!cluster) continue;
    out[blockId as keyof LayoutOverrides] = cluster;
  }
  return out;
}

function isDragLesson(
  l: Lesson,
): l is Lesson & { details: DragDetails } {
  return (
    l.kind === "drag" &&
    !!l.details &&
    "blockId" in l.details &&
    "after" in l.details &&
    !!(l.details as DragDetails).after
  );
}

function pickClusterByMedian(
  points: BlockPosition[],
  spreadPx: number,
): BlockPosition | null {
  if (points.length < MIN_DRAGS_TO_PROMOTE) return null;
  const xs = points.map((p) => p.x).sort((a, b) => a - b);
  const ys = points.map((p) => p.y).sort((a, b) => a - b);
  if (xs[xs.length - 1] - xs[0] > spreadPx) return null;
  if (ys[ys.length - 1] - ys[0] > spreadPx) return null;
  return { x: median(xs), y: median(ys) };
}

function median(sorted: number[]): number {
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}
