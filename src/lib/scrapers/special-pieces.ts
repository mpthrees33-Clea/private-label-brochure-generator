import * as cheerio from "cheerio";
import { INCH_MARK, parseSizeLabel, refineCoarseInchLabel } from "./size-format";
import type { ListedFormat } from "./listed-sizes";

// Trims and named decors are often one long line ("Battiscopa 7x80 / 2 7/8\"x32\""),
// so a per-node size scan never sees the piece word. Field tiles stay in the
// chart. Pieces that are only trims or named specials go on one line under it.
// Bullnose, covebase, and mosaic stay chart columns — those already fit.

const VULGAR: Record<string, string> = {
  "½": "1/2",
  "⅓": "1/3",
  "¼": "1/4",
  "¾": "3/4",
  "⅛": "1/8",
  "⅜": "3/8",
  "⅝": "5/8",
  "⅞": "7/8",
};

const SIZE_RE = new RegExp(
  `(\\d+(?:\\s+\\d+\\s*\\/\\s*\\d+|\\s*[.,]\\d+)?)\\s*${INCH_MARK}?\\s*[x×]\\s*(\\d+(?:\\s+\\d+\\s*\\/\\s*\\d+|\\s*[.,]\\d+)?)\\s*${INCH_MARK}?\\s*(cm|mm|in(?:ches|ch)?)?`,
  "gi",
);

const LINE_PIECES: { re: RegExp; word: string }[] = [
  { re: /\bbattiscopa\b|\bskirting\b|\bbaseboards?\b|\bbase\s+trims?\b/i, word: "base" },
  { re: /\bscalino\b|\bgradino\b/i, word: "scalino" },
  { re: /\bangolare\b|\bangolo\b/i, word: "corner" },
  { re: /\bstripes?\b/i, word: "stripe" },
  { re: /\b3d\s+hexagons?\b|\bhexagons?\b/i, word: "hexagon" },
];

const CHART_PIECES: { re: RegExp; word: string }[] = [
  { re: /\bcove\s*base\b|\bcovebase\b/i, word: "covebase" },
  { re: /\bbullnose\b|\bpencil\b|\blistello\b/i, word: "bullnose" },
  { re: /\bmosaics?\b|\bmosaico\b/i, word: "mosaic" },
];

const NAMED_SPECIAL =
  /\b(composizione\s+[a-z0-9]+(?:\s+(?:brass|glass))?|3d\s+hexagons?)\b/gi;

export function splitSpecialPieces(
  html: string,
  formats: ListedFormat[],
): { formats: ListedFormat[]; specials: string[] } {
  const flat = flatten(html);
  const occurrences = findOccurrences(flat);
  const byDim = new Map<string, Set<string>>();
  for (const occ of occurrences) {
    const kinds = byDim.get(occ.dim) ?? new Set<string>();
    kinds.add(occ.kind);
    byDim.set(occ.dim, kinds);
  }

  const specials: string[] = [];
  const seen = new Set<string>();
  const push = (label: string) => {
    const key = label.toLowerCase().replace(/\s+/g, " ").trim();
    if (!key || seen.has(key)) return;
    seen.add(key);
    specials.push(label);
  };

  for (const occ of occurrences) {
    if (occ.kind === "field" || occ.kind === "bullnose" || occ.kind === "covebase" || occ.kind === "mosaic") {
      continue;
    }
    const kinds = byDim.get(occ.dim);
    // A field listing of the same inches stays in the chart. Stripe is extra.
    // A decor that repeats the field size (Glow) is already that column.
    if (redundantMetric(occ, occurrences)) continue;
    if (occ.kind === "deco" && byDim.get(occ.dim)?.has("stripe")) continue;
    if (kinds?.has("field")) {
      // Stripe shares the field inches. A decor in a field size (12x12 deco)
      // is named on the line; the field column stays in the chart.
      push(occ.label);
      continue;
    }
    push(occ.label);
  }

  for (const match of flat.matchAll(NAMED_SPECIAL)) {
    push(titleCase(match[1]));
  }

  const chartFormats = chartPiecesAsFormats(formats, occurrences);
  const nextFormats = [...formats, ...chartFormats]
    .map((format) => annotateChartPiece(format, occurrences))
    .filter((format) => keepFormat(format, byDim));

  return { formats: nextFormats, specials: preferPrintedInches(specials) };
}

/** A trim the size list skipped (a long color sentence) still belongs in the chart. */
function chartPiecesAsFormats(formats: ListedFormat[], occurrences: Occurrence[]): ListedFormat[] {
  const claimed = new Set(
    formats.map((format) => {
      const parsed = parseSizeLabel(format.raw);
      if (!parsed || parsed.widthIn <= 0) return "";
      return `${parsed.widthIn}x${parsed.heightIn}|${parsed.piece}`;
    }),
  );
  const added: ListedFormat[] = [];
  for (const occ of occurrences) {
    if (occ.kind !== "bullnose" && occ.kind !== "covebase" && occ.kind !== "mosaic") continue;
    const key = `${occ.dim}|${occ.kind}`;
    if (claimed.has(key)) continue;
    claimed.add(key);
    added.push({ raw: occ.label });
  }
  return added;
}

function redundantMetric(occ: Occurrence, occurrences: Occurrence[]): boolean {
  if (!occ.metric) return false;
  const [aw, ah] = occ.dim.split("x").map(Number);
  return occurrences.some((other) => {
    if (other === occ || !other.stated || other.kind !== occ.kind) return false;
    const [bw, bh] = other.dim.split("x").map(Number);
    return Math.abs(aw - bw) <= 1.25 && Math.abs(ah - bh) <= 1.25;
  });
}

function preferPrintedInches(labels: string[]): string[] {
  const rows = labels.map((label) => ({ label, size: parseSizeLabel(label) }));
  return rows
    .filter((row, index) => {
      if (!row.size) return true;
      const piece = row.label.replace(/[\d./"”\s]/g, "");
      return !rows.some((other, otherIndex) => {
        if (index === otherIndex || !other.size) return false;
        const otherPiece = other.label.replace(/[\d./"”\s]/g, "");
        if (piece !== otherPiece) return false;
        const close =
          Math.abs(row.size!.widthIn - other.size.widthIn) <= 0.4 &&
          Math.abs(row.size!.heightIn - other.size.heightIn) <= 0.4;
        return close && /\d\s+\d+\//.test(other.label) && !/\d\s+\d+\//.test(row.label);
      });
    })
    .map((row) => row.label);
}

interface Occurrence {
  dim: string;
  kind: string;
  label: string;
  index: number;
  stated: boolean;
  metric: boolean;
  cm: [number, number] | null;
}

function findOccurrences(flat: string): Occurrence[] {
  const matches: { raw: string; index: number; end: number }[] = [];
  const re = new RegExp(SIZE_RE.source, "gi");
  let match: RegExpExecArray | null;
  while ((match = re.exec(flat))) {
    const prefix = flat.slice(Math.max(0, match.index - 4), match.index);
    // "2 7/8" is one size. A second hit on "7/8" is the fraction, not a tile.
    if (/\d\s*$/.test(prefix) && /^\d+\s*\//.test(match[0])) continue;
    matches.push({ raw: match[0], index: match.index, end: match.index + match[0].length });
  }

  const markers = pieceMarkers(flat);
  const out: Occurrence[] = [];
  for (const current of matches) {
    const kind = kindFor(flat, current, matches, markers);
    const parsed = parseSizeLabel(normalizeFractions(current.raw));
    if (!parsed || parsed.widthIn <= 0) continue;
    const dim = `${parsed.widthIn}x${parsed.heightIn}`;
    const suffix = kind === "field" ? "" : kind === "deco" ? " deco" : ` ${kind}`;
    out.push({
      dim,
      kind,
      label: `${parsed.label}${suffix}`.replace(/\s+/g, " ").trim(),
      index: current.index,
      stated: Boolean(parsed.statedInches),
      metric: Boolean(parsed.fromMetric),
      cm: centimeters(current.raw),
    });
  }
  shareTwinKinds(out);
  refineCoarseTwins(out);
  return out;
}

function centimeters(raw: string): [number, number] | null {
  const match = raw.match(/(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*cm\b/i);
  if (!match) return null;
  return [Number(match[1].replace(",", ".")), Number(match[2].replace(",", "."))];
}

function refineCoarseTwins(occurrences: Occurrence[]): void {
  for (const stated of occurrences) {
    if (!stated.stated) continue;
    const [width, height] = stated.dim.split("x").map(Number);
    const twin = occurrences.find((other) => {
      if (!other.cm || other === stated) return false;
      const [otherWidth, otherHeight] = other.dim.split("x").map(Number);
      return Math.abs(width - otherWidth) <= 1.25 && Math.abs(height - otherHeight) <= 1.25;
    });
    if (!twin?.cm) continue;
    stated.label = refineCoarseInchLabel(stated.label, twin.cm[0], twin.cm[1]);
  }
}

function shareTwinKinds(occurrences: Occurrence[]): void {
  for (let i = 0; i < occurrences.length - 1; i++) {
    const current = occurrences[i];
    const next = occurrences[i + 1];
    if (current.kind !== "field" || next.kind === "field") continue;
    if (next.index - current.index > 48) continue;
    const [aw, ah] = current.dim.split("x").map(Number);
    const [bw, bh] = next.dim.split("x").map(Number);
    // 7,2x80 cm is the metric twin of a printed 2"x31", even when the snap is an inch off.
    const loose = Math.abs(aw - bw) <= 1.25 && Math.abs(ah - bh) <= 1.25;
    const tight = Math.abs(aw - bw) <= 0.6 && Math.abs(ah - bh) <= 0.6;
    if (!loose || (!tight && !/[”"″]/.test(next.label) && !/\d\s+\d+\//.test(next.label))) continue;
    current.kind = next.kind;
    current.label = `${current.label} ${next.kind}`.replace(/\s+/g, " ").trim();
  }
}

function pieceMarkers(flat: string): { index: number; word: string; line: boolean }[] {
  const markers: { index: number; word: string; line: boolean }[] = [];
  const patterns = [
    ...LINE_PIECES.map((piece) => ({ ...piece, line: true })),
    ...CHART_PIECES.map((piece) => ({ ...piece, line: false })),
    { re: /\bdeco(?:rative|rs?|s)?\b/gi, word: "deco", line: false },
  ];
  for (const pattern of patterns) {
    const re = new RegExp(pattern.re.source, "gi");
    let match: RegExpExecArray | null;
    while ((match = re.exec(flat))) {
      markers.push({ index: match.index, word: pattern.word, line: pattern.line });
    }
  }
  return markers.sort((a, b) => a.index - b.index);
}

function kindFor(
  flat: string,
  current: { index: number; end: number },
  matches: { index: number; end: number }[],
  markers: { index: number; word: string; line: boolean }[],
): string {
  const suffix = suffixMarker(flat, current, matches, markers);
  // "3\" x 24\" Bullnose" and "13\" x 23 5/8\" Scalino".
  if (suffix) return suffix.word;

  const next = matches.find((match) => match.index > current.index);
  // "7,2x60 cm 2 13/16\" Battiscopa" — the inch half carries the name.
  if (next && next.index - current.end < 40 && suffixMarker(flat, next, matches, markers)) {
    return "field";
  }

  const preceding = [...markers].reverse().find((marker) => marker.index < current.index);
  if (!preceding) return "field";
  const window = preceding.line ? 100 : 24;
  if (current.index - preceding.index > window) return "field";
  if (!preceding.line) {
    // "Bullnose" after the previous size belongs to that size, not this one.
    const prev = [...matches].reverse().find((match) => match.end <= preceding.index);
    if (prev && preceding.index - prev.end <= 18) return "field";
  }
  return preceding.word;
}

function suffixMarker(
  flat: string,
  current: { index: number; end: number },
  matches: { index: number; end: number }[],
  markers: { index: number; word: string; line: boolean }[],
): { index: number; word: string; line: boolean } | undefined {
  const nextSize = matches.find((match) => match.index > current.index);
  const marker = markers.find(
    (item) =>
      item.index >= current.end &&
      item.index - current.end <= (item.line ? 28 : 18) &&
      (!nextSize || item.index < nextSize.index),
  );
  if (!marker) return undefined;
  // "48\"x110\" R Battiscopa" introduces the next sizes. "23 5/8\" Scalino" names this one.
  if (marker.line && /[a-z]/i.test(flat.slice(current.end, marker.index))) return undefined;
  return marker;
}

function annotateChartPiece(format: ListedFormat, occurrences: Occurrence[]): ListedFormat {
  const parsed = parseSizeLabel(format.raw);
  if (!parsed || parsed.widthIn <= 0) return format;
  if (/\b(bullnose|covebase|mosaic|deco|paver|chevron)\b/i.test(format.raw)) return format;
  const dim = `${parsed.widthIn}x${parsed.heightIn}`;
  const kinds = new Set(occurrences.filter((occ) => occ.dim === dim).map((occ) => occ.kind));
  if (kinds.size !== 1) return format;
  const kind = [...kinds][0];
  if (kind !== "bullnose" && kind !== "covebase" && kind !== "mosaic") return format;
  return { ...format, raw: `${format.raw} ${kind}` };
}

function keepFormat(format: ListedFormat, byDim: Map<string, Set<string>>): boolean {
  const parsed = parseSizeLabel(format.raw);
  if (!parsed || parsed.widthIn <= 0) return true;
  if (/\b(bullnose|covebase|mosaic|paver|chevron)\b/i.test(format.raw)) return true;
  const dim = `${parsed.widthIn}x${parsed.heightIn}`;
  const kinds = byDim.get(dim);
  if (!kinds) return true;
  if (kinds.has("field")) return true;
  // Only a trim or a decor listing — the line under the chart carries it.
  const onlyLine = [...kinds].every((kind) => kind !== "bullnose" && kind !== "covebase" && kind !== "mosaic");
  return !onlyLine;
}

function flatten(html: string): string {
  const $ = cheerio.load(html.replace(/></g, "> <"));
  $("script, style, noscript").remove();
  // A decor tab prints its sizes without the word "deco" on each line.
  $("[id*='decoro'], [id*='decor-tab']").prepend(" deco ");
  return normalizeFractions($("body").text()).replace(/\s+/g, " ");
}

function normalizeFractions(text: string): string {
  return text
    .replace(/(\d)\s*([½⅓¼¾⅛⅜⅝⅞])/g, (_, digit, ch) => `${digit} ${VULGAR[ch] ?? ch}`)
    .replace(/[½⅓¼¾⅛⅜⅝⅞]/g, (ch) => VULGAR[ch] ?? ch);
}

function titleCase(raw: string): string {
  return raw
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b([a-z])/gi, (letter) => letter.toUpperCase())
    .replace(/\b3d\b/i, "3D");
}
