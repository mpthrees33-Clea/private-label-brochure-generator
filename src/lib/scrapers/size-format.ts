import type { SizeIcon } from "./types";

// Trinity's printed size chart uses nominal inches: 12"x24", 3"x12",
// 3"x6" bullnose. Factory pages do not. Florida Tile wall lines write
// "Wall Tile (Glossy) - 4x16" once per finish; European lines write
// "40x120cm". Both have to land on the same chart grammar or the
// brochure header wraps, duplicates ("24x48 deco deco"), and the icon
// is wrong (a field rectangle for a subway plank).

export interface ParsedSize {
  /** Chart label without a trailing " deco" — isDeco carries that. */
  label: string;
  widthIn: number;
  heightIn: number;
  iconKind: SizeIcon;
  isDeco: boolean;
  piece: "field" | "bullnose" | "mosaic" | "chevron" | "paver";
  finish: string | null;
}

const CM_TO_NOMINAL_IN: Array<[number, number]> = [
  [6, 2.5],
  [7.5, 3],
  [8, 3],
  [10, 4],
  [15, 6],
  [20, 8],
  [30, 12],
  [40, 16],
  [45, 18],
  [60, 24],
  [75, 30],
  [80, 32],
  [90, 36],
  [100, 40],
  [120, 48],
  [160, 63],
  [180, 71],
  [278, 110],
  [320, 126],
];

const INCH_NOMINALS = new Set([
  1, 2, 2.5, 3, 4, 5, 6, 8, 12, 13, 16, 18, 24, 36, 48,
]);

export function canonicalFinish(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s = raw
    .toLowerCase()
    .replace(/[_+./-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  s = s.replace(/\bdeco(?:rative|r)?\b/g, "").trim();
  if (!s || s === "n/a" || s === "na") return null;
  if (/deep\s*glaze/.test(s)) return "deep glaze";
  if (/3d\s*plus|3dplus/.test(s)) return "3d plus";
  if (/^3d$/.test(s) || /\b3d\b/.test(s)) return "3d";
  if (/\bsilk\b/.test(s)) return "silk";
  if (/gloss/.test(s)) return "glossy";
  if (/polish|lappato/.test(s)) return "polished";
  if (/grip|non slip|structured|antislip|anti slip/.test(s)) return "grip";
  if (/textur|brush/.test(s)) return "textured";
  if (/matte|\bmatt\b|naturale|natural|honed/.test(s)) return "matte";
  return null;
}

export function parseSizeLabel(raw: string): ParsedSize | null {
  const text = raw.replace(/\s+/g, " ").trim();
  if (!text) return null;

  const dim = text.match(
    /(\d+(?:[._]\d+)?)\s*(?:["”″])?\s*[x×]\s*(\d+(?:[._]\d+)?)\s*(?:["”″])?\s*(cm|mm)?/i,
  );
  if (!dim) {
    // A trapezoid mosaic often has no chip rectangle, only a sheet size.
    if (/\btrapezoids?\b/i.test(text)) {
      return {
        label: "trapezoid mosaic",
        widthIn: 0,
        heightIn: 0,
        iconKind: "mosaic",
        isDeco: false,
        piece: "mosaic",
        finish: finishFromSizeText(text),
      };
    }
    return null;
  }

  let a = Number(dim[1].replace("_", "."));
  let b = Number(dim[2].replace("_", "."));
  if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0) return null;

  const unit = (dim[3] ?? "").toLowerCase();
  if (unit === "mm") {
    a /= 10;
    b /= 10;
  }
  const metric = unit === "cm" || unit === "mm" || looksMetric(text, a, b);
  if (metric) {
    a = cmToNominalInches(a);
    b = cmToNominalInches(b);
  }

  const widthIn = Math.min(a, b);
  const heightIn = Math.max(a, b);
  const piece = detectPiece(text);
  const isDeco = piece === "field" ? /\bdeco(?:rative|r)?\b/i.test(text) : false;
  const finish = finishFromSizeText(text);
  const suffix =
    piece === "bullnose"
      ? " bullnose"
      : piece === "mosaic"
        ? " mosaic"
        : piece === "chevron"
          ? " chevron"
          : piece === "paver"
            ? " paver"
            : "";
  const label = `${formatIn(widthIn)}"x${formatIn(heightIn)}"${suffix}`;

  return {
    label,
    widthIn,
    heightIn,
    iconKind: inferIconKind(widthIn, heightIn, piece),
    isDeco,
    piece: piece === "field" ? "field" : piece,
    finish,
  };
}

function detectPiece(text: string): ParsedSize["piece"] {
  if (/\bbullnose\b|\bpencil\b|\blistello\b/i.test(text)) return "bullnose";
  if (/\bmosaics?\b|\btrapezoids?\b/i.test(text)) return "mosaic";
  if (/\bchevron\b/i.test(text)) return "chevron";
  if (/\bpaver\b|\b2\s*cm\b|\b20\s*mm\b/i.test(text)) return "paver";
  return "field";
}

function finishFromSizeText(text: string): string | null {
  const paren = text.match(/\(([^)]+)\)/);
  if (paren) {
    const fromParen = canonicalFinish(paren[1]);
    if (fromParen) return fromParen;
  }
  return canonicalFinish(text);
}

function looksMetric(text: string, a: number, b: number): boolean {
  if (/["”″]|inch/i.test(text)) return false;
  const max = Math.max(a, b);
  if (max > 48) return true;
  // 40x120, 30x60, 100x100 — cm nominals that are not also inch sizes.
  const cmOnly = new Set([20, 30, 40, 45, 60, 75, 80, 90, 100, 120]);
  const aCm = cmOnly.has(a);
  const bCm = cmOnly.has(b);
  if ((aCm || bCm) && (!INCH_NOMINALS.has(a) || !INCH_NOMINALS.has(b))) return true;
  return false;
}

export function cmToNominalInches(cm: number): number {
  let bestIn = cm / 2.54;
  let bestDist = Infinity;
  for (const [nominalCm, inches] of CM_TO_NOMINAL_IN) {
    const dist = Math.abs(cm - nominalCm);
    if (dist < bestDist) {
      bestDist = dist;
      bestIn = inches;
    }
  }
  if (bestDist <= 1.6) return bestIn;
  return Math.round((cm / 2.54) * 2) / 2;
}

function formatIn(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return String(Math.round(n * 10) / 10);
}

export function inferIconKind(
  widthIn: number,
  heightIn: number,
  piece: ParsedSize["piece"],
): SizeIcon {
  if (piece === "mosaic") return "mosaic";
  if (piece === "bullnose") return "bullnose";
  const min = Math.min(widthIn, heightIn);
  const max = Math.max(widthIn, heightIn);
  if (max / min < 1.15) return "square";
  // Subway and wall field (3x6, 3x12, 4x16) plus narrow floor planks.
  if (piece === "chevron") return "plank";
  if (min <= 8 && max / min >= 1.8) return "plank";
  return "rectangle";
}

/** Header text for one size column. Never appends "deco" twice.
 *  Mesh-mounted mosaics keep the sheet in parentheses:
 *  4"x4" mosaic (12"x12" sheet). */
export function sizeChartLabel(size: {
  label: string;
  isDeco?: boolean | null;
  sheetLabel?: string | null;
}): string {
  const stripped = size.label
    .replace(/\s+deco$/i, "")
    .replace(/\s+\([^)]*sheet\)\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  const deco = Boolean(size.isDeco) || /\bdeco\b/i.test(size.label);
  let out = deco ? `${stripped} deco` : size.label.replace(/\s+\([^)]*sheet\)\s*$/i, "").replace(/\s+/g, " ").trim();
  const sheet = (size.sheetLabel || "").trim();
  if (sheet && !/sheet\)/i.test(out)) out = `${out} (${sheet} sheet)`;
  return out;
}

/** Nominal inch label for a mesh sheet. 11.61" prints as 12". */
export function nominalSheetLabel(raw: string): string | null {
  const parsed = parseSizeLabel(raw);
  if (!parsed || parsed.widthIn <= 0 || parsed.heightIn <= 0) return null;
  const snap = (n: number) => {
    const rounded = Math.round(n);
    return Math.abs(n - rounded) <= 0.5 ? rounded : n;
  };
  return `${formatIn(snap(parsed.widthIn))}"x${formatIn(snap(parsed.heightIn))}"`;
}

function normKey(s: string): string {
  return s
    .toLowerCase()
    .replace(/\([^)]*sheet\)/g, "")
    .replace(/[“”″"]/g, "")
    .replace(/\s+/g, "")
    .replace(/×/g, "x");
}

export function sizeAvailable(
  size: { label: string; isDeco?: boolean | null },
  avail: string[] | undefined,
): boolean {
  if (!avail || avail.length === 0) return false;
  const display = normKey(sizeChartLabel(size));
  const bare = normKey(size.label.replace(/\s+deco$/i, ""));
  const deco = Boolean(size.isDeco) || /\bdeco\b/i.test(size.label);
  return avail.some((entry) => {
    const n = normKey(entry);
    if (deco) {
      return n === display || n === `${bare}deco`;
    }
    if (n.includes("deco")) return false;
    return n === normKey(size.label) || n === bare || n === display;
  });
}
