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
  /** Converted from a cm/mm measurement. */
  fromMetric?: boolean;
  /** The factory printed this inch size, including a mixed number. */
  statedInches?: boolean;
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

/** Quote, prime, or the doubled apostrophe factories print for inches (24''x48''). */
export const INCH_MARK = `(?:["”″′]|['’]{1,2})`;

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
  const text = raw
    .replace(/(\d),(\d{1,2})(?!\d)/g, "$1.$2")
    .replace(/(\d)\s*([½⅓¼¾⅛⅜⅝⅞])/g, (_, digit, ch) => {
      const map: Record<string, string> = {
        "½": "1/2",
        "⅓": "1/3",
        "¼": "1/4",
        "¾": "3/4",
        "⅛": "1/8",
        "⅜": "3/8",
        "⅝": "5/8",
        "⅞": "7/8",
      };
      return `${digit} ${map[ch] ?? ch}`;
    })
    .replace(/[½⅓¼¾⅛⅜⅝⅞]/g, (ch) => {
      const map: Record<string, string> = {
        "½": "1/2",
        "⅓": "1/3",
        "¼": "1/4",
        "¾": "3/4",
        "⅛": "1/8",
        "⅜": "3/8",
        "⅝": "5/8",
        "⅞": "7/8",
      };
      return map[ch] ?? ch;
    })
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return null;

  const stated = printedInchPair(text);
  const metric = metricPair(text);
  if (stated && metric) {
    const aCm = metric.unit === "mm" ? metric.a / 10 : metric.a;
    const bCm = metric.unit === "mm" ? metric.b / 10 : metric.b;
    const na = nominalDetail(aCm);
    const nb = nominalDetail(bCm);
    const nominalTwin =
      na.snapped &&
      nb.snapped &&
      Math.abs(na.inches - stated.a) <= 0.1 &&
      Math.abs(nb.inches - stated.b) <= 0.1;
    if (nominalTwin) return finishSize(na.inches, nb.inches, text, { fromMetric: true });
    return finishSize(stated.a, stated.b, text, {
      statedInches: true,
      aLabel: stated.aLabel,
      bLabel: stated.bLabel,
    });
  }
  if (stated) {
    return finishSize(stated.a, stated.b, text, {
      statedInches: true,
      aLabel: stated.aLabel,
      bLabel: stated.bLabel,
    });
  }

  const dim = text.match(
    new RegExp(
      `(\\d+(?:[._]\\d+)?)\\s*${INCH_MARK}?\\s*[x×]\\s*(\\d+(?:[._]\\d+)?)\\s*${INCH_MARK}?\\s*(cm|mm)?`,
      "i",
    ),
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
  const fromMetric = unit === "cm" || unit === "mm" || looksMetric(text, a, b);
  if (fromMetric) {
    a = cmToNominalInches(a);
    b = cmToNominalInches(b);
  } else if (Math.max(a, b) > 48) {
    // 150x150 is a pixel or a CSS box, not a tile. Real oversized
    // formats are written in cm (120x278cm) and take the metric path.
    return null;
  }

  return finishSize(a, b, text, { fromMetric });
}

function finishSize(
  a: number,
  b: number,
  text: string,
  flags: { fromMetric?: boolean; statedInches?: boolean; aLabel?: string; bLabel?: string },
): ParsedSize {
  const widthIn = Math.min(a, b);
  const heightIn = Math.max(a, b);
  const aLabel = a <= b ? flags.aLabel : flags.bLabel;
  const bLabel = a <= b ? flags.bLabel : flags.aLabel;
  const piece = detectPiece(text);
  const isDeco = piece === "field" ? /\bdeco(?:rative|r)?\b/i.test(text) : false;
  const finish = finishFromSizeText(text);
  const suffix = pieceSuffix(text, piece);
  const label = flags.statedInches && aLabel && bLabel
    ? `${aLabel}"x${bLabel}"${suffix}`
    : `${formatIn(widthIn)}"x${formatIn(heightIn)}"${suffix}`;
  return {
    label,
    widthIn,
    heightIn,
    iconKind: inferIconKind(widthIn, heightIn, piece),
    isDeco,
    piece: piece === "field" ? "field" : piece,
    finish,
    fromMetric: flags.fromMetric,
    statedInches: flags.statedInches,
  };
}

function pieceSuffix(text: string, piece: ParsedSize["piece"]): string {
  if (/\bcove\s*base\b|\bcovebase\b/i.test(text)) return " covebase";
  if (piece === "bullnose") return " bullnose";
  if (/\bbasket\s*weave\b|\bbasketweave\b/i.test(text)) return " basketweave";
  if (/\barch\s+mosaic\b/i.test(text)) return " arch mosaic";
  if (piece === "mosaic") return " mosaic";
  if (piece === "chevron") return " chevron";
  if (piece === "paver") return " paver";
  return "";
}

function detectPiece(text: string): ParsedSize["piece"] {
  if (/\bbullnose\b|\bpencil\b|\blistello\b/i.test(text)) return "bullnose";
  if (/\bmosaics?\b|\btrapezoids?\b|\bbasketweave\b|\bbasket\s*weave\b/i.test(text)) return "mosaic";
  if (/\bchevron\b/i.test(text)) return "chevron";
  if (/\bpaver\b|\b2\s*cm\b|\b20\s*mm\b/i.test(text)) return "paver";
  return "field";
}

interface InchSide {
  n: number;
  label: string;
}

function printedInchPair(
  text: string,
): { a: number; b: number; aLabel: string; bLabel: string } | null {
  const word = text.match(
    /(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(?:in(?:ches|ch)?)\b/i,
  );
  if (word && !/\bcm\b|\bmm\b/i.test(word[0])) {
    return {
      a: Number(word[1]),
      b: Number(word[2]),
      aLabel: formatIn(Number(word[1])),
      bLabel: formatIn(Number(word[2])),
    };
  }
  const re = new RegExp(
    `(\\d+\\s+\\d+\\s*\\/\\s*\\d+|\\d+\\/\\d+|\\d+(?:\\.\\d+)?)\\s*${INCH_MARK}?\\s*[x×]\\s*(\\d+\\s+\\d+\\s*\\/\\s*\\d+|\\d+\\/\\d+|\\d+(?:\\.\\d+)?)\\s*${INCH_MARK}`,
    "gi",
  );
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    if (!/["”″′'’]/.test(match[0])) continue;
    const left = parseInchSide(match[1]);
    const right = parseInchSide(match[2]);
    if (!left || !right) continue;
    return { a: left.n, b: right.n, aLabel: left.label, bLabel: right.label };
  }
  return null;
}

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y) {
    const next = x % y;
    x = y;
    y = next;
  }
  return x || 1;
}

function reducedFraction(numerator: number, denominator: number): string {
  const divisor = gcd(numerator, denominator);
  return `${numerator / divisor}/${denominator / divisor}`;
}

/** 7.2 cm is 2 13/16", not the coarse 2" printed beside it. A side already
 *  within 5/8" of the metric measurement stays as printed (31" next to 80 cm). */
export function refineCoarseInchLabel(label: string, cmWidth: number, cmHeight: number): string {
  const match = label.match(
    /^(\d+(?:\s+\d+\/\d+)?(?:\.\d+)?)"x(\d+(?:\s+\d+\/\d+)?(?:\.\d+)?)"(.*)$/i,
  );
  if (!match) return label;
  const left = refineInchSide(match[1], cmWidth);
  const right = refineInchSide(match[2], cmHeight);
  return `${left}"x${right}"${match[3]}`;
}

function refineInchSide(printed: string, cm: number): string {
  const side = parseInchSide(printed);
  if (!side || !Number.isFinite(cm) || cm <= 0) return printed;
  const exact = cm / 2.54;
  if (Math.abs(side.n - exact) <= 0.625) return side.label;
  return mixedSixteenth(exact);
}

function mixedSixteenth(inches: number): string {
  const sixteenths = Math.round(inches * 16);
  const whole = Math.floor(sixteenths / 16);
  let numerator = sixteenths - whole * 16;
  const divisor = gcd(numerator, 16);
  numerator /= divisor;
  const denominator = 16 / divisor;
  if (numerator === 0) return String(whole);
  if (whole === 0) return `${numerator}/${denominator}`;
  return `${whole} ${numerator}/${denominator}`;
}

function parseInchSide(token: string): InchSide | null {
  const t = token.trim();
  const spaced = /^(\d+)\s+(\d+)\s*\/\s*(\d+)$/.exec(t);
  if (spaced) {
    const whole = Number(spaced[1]);
    const numerator = Number(spaced[2]);
    const denominator = Number(spaced[3]);
    return {
      n: whole + numerator / denominator,
      label: `${whole} ${reducedFraction(numerator, denominator)}`,
    };
  }
  const frac = /^(\d+)\/(\d+)$/.exec(t);
  if (frac) {
    const digits = frac[1];
    for (const numLen of [2, 1]) {
      if (digits.length <= numLen) continue;
      const whole = digits.slice(0, digits.length - numLen);
      const num = digits.slice(digits.length - numLen);
      if (whole.length < 1 || whole.length > 2) continue;
    return {
      n: Number(whole) + Number(num) / Number(frac[2]),
      label: `${Number(whole)} ${reducedFraction(Number(num), Number(frac[2]))}`,
    };
  }
  return {
    n: Number(frac[1]) / Number(frac[2]),
    label: reducedFraction(Number(frac[1]), Number(frac[2])),
  };
}
  if (/^\d+(?:\.\d+)?$/.test(t)) {
    const n = Number(t);
    return { n, label: formatIn(n) };
  }
  return null;
}

function metricPair(text: string): { a: number; b: number; unit: "cm" | "mm" } | null {
  const match = text.match(/(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*(cm|mm)\b/i);
  if (!match) return null;
  return {
    a: Number(match[1].replace(",", ".")),
    b: Number(match[2].replace(",", ".")),
    unit: match[3].toLowerCase() as "cm" | "mm",
  };
}

function nominalDetail(cm: number): { inches: number; snapped: boolean } {
  let bestIn = cm / 2.54;
  let bestDist = Infinity;
  for (const [nominalCm, inches] of CM_TO_NOMINAL_IN) {
    const dist = Math.abs(cm - nominalCm);
    if (dist < bestDist) {
      bestDist = dist;
      bestIn = inches;
    }
  }
  if (bestDist <= 1.6) return { inches: bestIn, snapped: true };
  return { inches: cmToNominalInches(cm), snapped: false };
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
  if (/["”″′'’]|inch/i.test(text)) return false;
  // 40x120, 30x60, 100x100 — cm nominals that are not also inch sizes.
  // A bare 150x150 is not one of these; do not treat every large pair as cm.
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
  if (!Number.isFinite(n)) return "";
  const rounded = Math.round(n * 100) / 100;
  if (Number.isInteger(rounded)) return String(rounded);
  return String(rounded);
}

/** When a page prints both 7.87" and 200mm, keep the stated inches.
 *  When 10cm is the nominal of a printed 3 15/16", keep the nominal. */
export function dropNominalTwins<T extends ParsedSize>(rows: T[]): T[] {
  const close = (a: ParsedSize, b: ParsedSize, tol: number) =>
    Math.abs(a.widthIn - b.widthIn) <= tol && Math.abs(a.heightIn - b.heightIn) <= tol;
  const keptMetric = rows.filter((row) => {
    if (!row.fromMetric) return true;
    const stated = rows.find((other) => other.statedInches && close(row, other, 0.55));
    if (!stated) return true;
    return close(row, stated, 0.1);
  });
  return keptMetric.filter((row) => {
    if (!row.statedInches) return true;
    return !keptMetric.some((other) => other.fromMetric && close(row, other, 0.1));
  });
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
