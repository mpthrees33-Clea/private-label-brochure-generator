import { isJunkImage, largerTwinUrl } from "./image-sniff";
import { parseSizeLabel } from "./scrapers/size-format";

const PLACEHOLDER =
  /data:image|spacer|blank\.gif|pixel\.gif|placeholder|transparent\.gif|(?:^|[^\d])1x1(?:[^\d]|$)/i;

export function isPlaceholderImageUrl(url: string): boolean {
  return PLACEHOLDER.test(url || "");
}

/**
 * Shopify (and its /cdn/shop/ files) downscale with ?width=.
 * Dropping that param fetches the original file, which is never an upscale.
 * A `crop` param is an intentional framing, so those URLs stay as published.
 */
export function upgradeImageUrl(url: string): string {
  const trimmed = (url || "").trim();
  if (!trimmed) return "";
  const larger = largerTwinUrl(trimmed);
  const next = larger ?? trimmed;
  try {
    const parsed = new URL(next);
    const shopify =
      parsed.hostname.includes("cdn.shopify") ||
      parsed.hostname.includes("myshopify") ||
      /\/cdn\/shop\//.test(parsed.pathname);
    if (shopify && parsed.searchParams.has("width") && !parsed.searchParams.has("crop")) {
      parsed.searchParams.delete("width");
      parsed.searchParams.delete("height");
      return parsed.toString();
    }
  } catch {
    return next;
  }
  return next;
}

/** Higher means a larger rendition of the same picture. Unconstrained originals win. */
export function imagePixelScore(url: string): number {
  const raw = url || "";
  let score = 0;
  let constrained = false;
  try {
    const parsed = new URL(raw, "https://placeholder.local");
    const width = parsed.searchParams.get("width");
    if (width && /^\d+$/.test(width) && !parsed.searchParams.has("crop")) {
      score = Number(width);
      constrained = true;
    }
    const trim = parsed.pathname.match(/\/trim\/(\d+)x\//i);
    if (trim) {
      score = Math.max(score, Number(trim[1]));
      constrained = true;
    }
  } catch {
    // relative or malformed — score the path only
  }
  const file = raw.split("?")[0] ?? raw;
  const rendition = file.match(/[-_](\d{3,5})x(\d{3,5})\.(?:png|jpe?g|webp|gif)$/i);
  if (rendition) {
    const edge = Math.max(Number(rendition[1]), Number(rendition[2]));
    if (edge >= 300) {
      score = Math.max(score, edge);
      constrained = true;
    }
  }
  if (!constrained) score += 100_000;
  if (/_larger\./i.test(raw)) score += 5_000;
  if (/_public\./i.test(raw)) score -= 5_000;
  return score;
}

/** Largest usable candidate, then upgraded so a CDN width cap is not stored. */
export function bestImageUrl(urls: Array<string | null | undefined>): string {
  const usable = urls
    .map((url) => (url || "").trim())
    .filter((url) => url && !isPlaceholderImageUrl(url) && !isJunkImage(url));
  if (usable.length === 0) return "";
  let best = usable[0];
  let bestScore = imagePixelScore(best);
  for (const url of usable.slice(1)) {
    const score = imagePixelScore(url);
    if (score > bestScore) {
      best = url;
      bestScore = score;
    }
  }
  return upgradeImageUrl(best);
}

export function urlsFromSrcset(srcset: string | undefined | null): string[] {
  if (!srcset) return [];
  const out: string[] = [];
  for (const part of srcset.split(",")) {
    const candidate = part.trim().split(/\s+/)[0];
    if (candidate) out.push(candidate);
  }
  return out;
}

/** A filename token like 20x20 or 4x4 is a tile format, not a pixel rendition. */
export function filenameHasTileSize(url: string): boolean {
  const base = (url || "").split("?")[0]?.split("/").pop() ?? "";
  const matches = base.match(/(\d{1,2}(?:_\d)?)[x×](\d{1,3})(?!\d)/gi) ?? [];
  for (const token of matches) {
    const parsed = parseSizeLabel(token.replace(/_/g, "."));
    if (!parsed || parsed.widthIn <= 0 || parsed.heightIn <= 0) continue;
    if (Math.max(parsed.widthIn, parsed.heightIn) <= 48) return true;
  }
  return false;
}
