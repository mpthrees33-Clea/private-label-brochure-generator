import { isJunkImage } from "./image-sniff";
import {
  filenameHasTileSize,
  isPlaceholderImageUrl,
  upgradeImageUrl,
} from "./image-url";

export interface HeroCandidate {
  url: string;
  alt?: string;
  width?: number;
  height?: number;
  /** Parent link, so a sell-sheet image pointed at a PDF or Drive file is not the hero. */
  linkHref?: string;
  /** Page banner or slider, as opposed to a color card. */
  lead?: boolean;
}

const ROOM =
  /room[_-]?scene|ambient|lifestyle|bathroom|kitchen|living|slider|moodboard/i;
const CLOSE = /detail|close[-_]?up|packshot|product[-_]?shot|\bhero\b/i;
const DIAGRAM = /outline|diagram|blueprint/i;
const DOCUMENT =
  /sell[-_ ]?sheet|sales[-_ ]?sheet|fact[-_ ]?sheet|\bmsds\b|spec[-_ ]?sheet|brochure|screenshot|\.svg(?:$|\?|\s)|(?:^|\/)thumbnail\.|drive\.google\.com|\.pdf(?:$|\?|\s)|(?:^|\/)[^/]*-ss-[^/]*\./i;

/**
 * Prefer a photo where the tile fills the frame. Wide room banners
 * (tile behind a tub, counter, or sofa) lose to a closer portrait.
 * A color chip is the hero only when the page has no install photo.
 */
export function pickHeroImage(
  candidates: HeroCandidate[],
  collectionName?: string | null,
): string | null {
  const cleaned = candidates
    .map((candidate) => ({
      ...candidate,
      url: upgradeImageUrl(candidate.url),
    }))
    .filter(
      (candidate) =>
        candidate.url &&
        !isPlaceholderImageUrl(candidate.url) &&
        !isJunkImage(candidate.url, candidate.alt ?? "") &&
        !DOCUMENT.test(`${candidate.url} ${candidate.alt ?? ""} ${candidate.linkHref ?? ""}`),
    );
  if (cleaned.length === 0) return null;

  const tokens = collectionTokens(collectionName);
  const named =
    tokens.length > 0
      ? cleaned.filter((candidate) =>
          tokens.some((token) => blobOf(candidate).includes(token)),
        )
      : cleaned;
  const namedInstalls = named.filter((candidate) => !isSwatchCandidate(candidate));
  let pool = named;
  if (namedInstalls.length > 0) pool = namedInstalls;
  else if (named.length === 0) {
    const leads = cleaned.filter(
      (candidate) => !isSwatchCandidate(candidate) && /\bhero\b|packshot/.test(blobOf(candidate)),
    );
    pool = leads.length > 0 ? leads : cleaned;
  }
  const installs = pool.filter((candidate) => !isSwatchCandidate(candidate));
  const usable = installs.length > 0 ? installs : pool;

  let bestUrl = usable[0].url;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const candidate of usable) {
    const score = scoreHero(candidate);
    if (score > bestScore) {
      bestScore = score;
      bestUrl = candidate.url;
    }
  }
  return bestUrl;
}

function scoreHero(candidate: HeroCandidate): number {
  let score = 10;
  const blob = `${candidate.url} ${candidate.alt ?? ""}`;
  const aspect = aspectOf(candidate);
  if (aspect != null) {
    if (aspect > 2.4 || aspect < 0.35) score -= 80;
    else if (aspect >= 0.7 && aspect <= 1.35) score += 40;
    else if (aspect > 1.7) score -= 25;
    score += Math.max(0, 24 - 30 * Math.abs(aspect - 0.95));
  }
  const edge = Math.max(
    candidate.width ?? 0,
    candidate.height ?? 0,
    edgeFromFilename(candidate.url),
  );
  score += Math.min(edge, 2400) / 80;
  if (ROOM.test(blob)) score -= 8;
  if (CLOSE.test(blob)) score += 20;
  if (DIAGRAM.test(blob)) score -= 60;
  if (candidate.lead) score += 18;
  if (isSwatchCandidate(candidate)) score -= 100;
  return score;
}

function blobOf(candidate: HeroCandidate): string {
  return `${candidate.url} ${candidate.alt ?? ""}`.toLowerCase();
}

function isSwatchCandidate(candidate: HeroCandidate): boolean {
  if (filenameHasTileSize(candidate.url)) return true;
  const width = candidate.width ?? 0;
  const height = candidate.height ?? 0;
  // A short wide pattern strip (the 670×210 color card) is a swatch, not a lead photo.
  if (height > 0 && height <= 280 && width / height >= 2.4) return true;
  return false;
}

function aspectOf(candidate: HeroCandidate): number | null {
  if (candidate.width && candidate.height && candidate.width > 0 && candidate.height > 0) {
    return candidate.width / candidate.height;
  }
  const match = candidate.url.match(/(\d{3,5})[x×](\d{3,5})/);
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (width < 300 || height < 80) return null;
  return width / height;
}

function edgeFromFilename(url: string): number {
  const match = url.match(/(\d{3,5})[x×](\d{3,5})/);
  if (!match) return 0;
  return Math.max(Number(match[1]), Number(match[2]));
}

const GENERIC_TOKENS = new Set([
  "about",
  "america",
  "ceramic",
  "collection",
  "collections",
  "glazed",
  "porcelain",
  "product",
  "products",
  "series",
  "tile",
  "tiles",
]);

function collectionTokens(name: string | null | undefined): string[] {
  return (name || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 4 && !GENERIC_TOKENS.has(token));
}
