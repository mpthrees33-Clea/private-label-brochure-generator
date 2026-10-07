import * as cheerio from "cheerio";
import type { TechSpecs } from "./types";

// Specs are kept only when the page or a spec sheet actually prints them.
// A separate "value required" column and a "declared" column are common;
// the rightmost real measurement on that row is the one the factory claims.

export interface SpecTextItem {
  str: string;
  x: number;
  y: number;
  width?: number;
}

const LABEL_RULES: { key: keyof TechSpecs; re: RegExp }[] = [
  { key: "waterAbsorption", re: /water\s*absorption/i },
  { key: "breakingStrength", re: /break(?:ing)?\s*strength/i },
  { key: "scratchHardness", re: /scratch\s*hardness|mohs(?:\s*hardness)?|moh['’]?s?\s*scale/i },
  { key: "chemicalResistance", re: /chemical\s*resist/i },
  { key: "shadeVariation", re: /(?:shade(?:\s*and\s*texture)?|color)\s*(?:variation|rating)/i },
  { key: "frostResistance", re: /frost\s*resist|freeze\s*resist/i },
  { key: "stainResistance", re: /stain\s*resist/i },
  { key: "dcof", re: /d\.?\s*c\.?\s*o\.?\s*f|dynamic\s*coefficient|slip\s*resist/i },
  { key: "thickness", re: /\bthickness\b/i },
];

export function parseTechSpecs(text: string): Partial<TechSpecs> {
  return parseTechSpecsFromHtml(`<body><p>${escapeHtml(text)}</p></body>`);
}

export function parseTechSpecsFromHtml(html: string): Partial<TechSpecs> {
  const $ = cheerio.load(html);
  $("script, style, noscript, nav, header, footer").remove();
  const specs: Partial<TechSpecs> = {};

  $("div, li, tr, dl").each((_, el) => {
    const kids = $(el).children().toArray();
    if (kids.length < 2 || kids.length > 8) return;
    const texts = kids
      .map((kid) => $(kid).text().replace(/\s+/g, " ").trim())
      .filter(Boolean);
    if (texts.length < 2 || texts.some((part) => part.length > 80)) return;
    const key = labelKey(texts[0]);
    if (!key) return;
    const value = valueFor(key, texts.slice(1).join(" "), texts[0]);
    if (value) specs[key] = value;
  });

  const flat = $("body").text().replace(/\s+/g, " ").trim();
  return { ...windowsFromText(flat), ...specs };
}

export function parseTechSpecItems(items: SpecTextItem[]): Partial<TechSpecs> {
  const usable = items.filter((item) => item.str && item.str.trim());
  const specs: Partial<TechSpecs> = {};
  Object.assign(specs, specsFromRows(cluster(usable, "y", 5)));
  Object.assign(specs, specsNearLabels(usable));
  Object.assign(specs, thicknessContinuation(usable));
  return specs;
}

/** Drop a model-written spec unless its number or word is in the source. */
export function groundTechSpecs(
  specs: Partial<TechSpecs>,
  sourceText: string,
): Partial<TechSpecs> {
  const text = sourceText
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase();
  const out: Partial<TechSpecs> = {};
  for (const key of Object.keys(specs) as (keyof TechSpecs)[]) {
    const value = specs[key];
    if (value == null || String(value).trim() === "") continue;
    if (isAbsent(String(value))) continue;
    if (!valueGrounded(key, String(value), text)) continue;
    out[key] = String(value).trim();
  }
  return out;
}

function isPerSizeNote(paren: string): boolean {
  return /\d/.test(paren) && /[x×]/i.test(paren);
}

function windowsFromText(flat: string): Partial<TechSpecs> {
  const specs: Partial<TechSpecs> = {};
  if (!flat) return specs;
  const thick = flat.match(/thickness(?:\s*\(\s*mm\s*\))?(.{0,90})/i);
  if (thick) {
    const mms = [...thick[1].matchAll(/(\d+(?:\.\d+)?)\s*mm(\s*\([^)]*\))?/gi)]
      .filter((m) => !isPerSizeNote(m[2] || ""))
      .map((m) => formatMm(m[1]));
    const bare =
      mms.length === 0 && /\(\s*mm\s*\)/i.test(thick[0])
        ? thick[1].match(/^\s*[:\s]*(\d+(?:\.\d+)?)\b/)
        : null;
    const values = mms.length ? mms : bare ? [formatMm(bare[1])] : [];
    if (values.length) specs.thickness = unique(values).join(" | ");
  }
  for (const rule of LABEL_RULES) {
    if (rule.key === "thickness" || specs[rule.key]) continue;
    const re = new RegExp(rule.re.source, "ig");
    let match: RegExpExecArray | null;
    while ((match = re.exec(flat))) {
      const window = flat.slice(match.index, match.index + match[0].length + 50);
      if (labelKey(window.slice(match[0].length)) && window.slice(match[0].length).length > 0) {
        // The next label starts immediately — this is a stacked header, not a value.
      }
      const value = valueFor(rule.key, window, match[0]);
      if (value) {
        specs[rule.key] = value;
        break;
      }
    }
  }
  return specs;
}

function specsFromRows(rows: SpecTextItem[][]): Partial<TechSpecs> {
  const specs: Partial<TechSpecs> = {};
  rows.forEach((row, index) => {
    const cells = splitCells(row);
    if (cells.length < 2) return;
    const key = labelKey(cells[0]);
    if (!key) return;
    const value = bestOf(key, cells.slice(1), cells[0]);
    if (value) specs[key] = value;
    if (key === "thickness" && rows[index + 1]) {
      const nextCells = splitCells(rows[index + 1]);
      if (!labelKey(nextCells[0] || "")) {
        const more = bestOf("thickness", nextCells, "thickness mm");
        if (more && specs.thickness && !specs.thickness.includes(more)) {
          specs.thickness = `${specs.thickness} | ${more}`;
        }
      }
    }
  });
  return specs;
}

function specsNearLabels(items: SpecTextItem[]): Partial<TechSpecs> {
  const specs: Partial<TechSpecs> = {};
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const used = new Set<SpecTextItem>();
  for (const head of sorted) {
    if (used.has(head)) continue;
    const second = sorted.find(
      (item) =>
        item !== head &&
        !used.has(item) &&
        head.y - item.y >= 2 &&
        head.y - item.y <= 14 &&
        Math.abs(item.x - head.x) <= 18 &&
        !labelKey(item.str) &&
        !looksLikeMeasurement(item.str),
    );
    const labelText = second ? `${head.str} ${second.str}` : head.str;
    const key = labelKey(labelText);
    if (!key) continue;
    if (second) used.add(second);
    const anchorY = second ? second.y : head.y;
    const anchorX = Math.min(head.x, second?.x ?? head.x);
    const anchorEnd = Math.max(itemEnd(head), second ? itemEnd(second) : 0);
    const values = items
      .filter((item) => item !== head && item !== second)
      .filter((item) => {
        const beside =
          Math.abs(item.y - head.y) <= 12 &&
          item.x >= anchorEnd - 8 &&
          looksLikeMeasurement(item.str);
        const under =
          anchorY - item.y >= 4 &&
          anchorY - item.y <= 30 &&
          item.x >= anchorX - 6 &&
          item.x <= anchorX + 36;
        return beside || under;
      })
      .sort((a, b) => a.x - b.x);
    const joined = values.map((item) => item.str).join(" ");
    const value =
      key === "chemicalResistance" || key === "stainResistance" || key === "frostResistance"
        ? valueFor(key, joined, labelText)
        : bestOf(key, splitCells(values), labelText);
    if (value) specs[key] = value;
  }
  return specs;
}

function itemEnd(item: SpecTextItem): number {
  return item.x + (item.width ?? Math.max(12, item.str.length * 5));
}

function looksLikeMeasurement(text: string): boolean {
  return /[≤≥<>%]|\d/.test(text) || /n\/?a|not applicable|unaffected|pass|fail/i.test(text);
}

function thicknessContinuation(items: SpecTextItem[]): Partial<TechSpecs> {
  const specs: Partial<TechSpecs> = {};
  const label = items.find((item) => /\bthickness\b/i.test(item.str));
  if (!label) return specs;
  const mms = items
    .filter((item) => item.x >= label.x - 8 && item.x < label.x + 420)
    .filter((item) => item.y <= label.y + 8 && label.y - item.y < 40)
    .map((item) => item.str)
    .join(" ");
  const values = unique([...mms.matchAll(/(\d+(?:\.\d+)?)\s*mm/gi)].map((m) => formatMm(m[1])));
  if (values.length) specs.thickness = values.join(" | ");
  return specs;
}

function bestOf(key: keyof TechSpecs, cells: string[], label: string): string | null {
  let found: string | null = null;
  for (const cell of cells) {
    const value = valueFor(key, cell, label);
    if (value) found = value;
  }
  return found;
}

function valueFor(key: keyof TechSpecs, text: string, label = ""): string | null {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned || isAbsent(cleaned)) return null;
  if (isStandardCode(cleaned)) return null;
  const hinted = `${label} ${cleaned}`;
  if (key === "frostResistance" && /not\s*resistant|\bno\b/i.test(hinted)) return null;
  if (key === "thickness") {
    const mms = [...hinted.matchAll(/(\d+(?:\.\d+)?)\s*mm/gi)].map((m) => formatMm(m[1]));
    if (mms.length) return unique(mms).join(" | ");
    if (/\(mm\)|\bmm\b/i.test(label)) {
      const bare = cleaned.match(/^(\d+(?:\.\d+)?)$/);
      if (bare) return formatMm(bare[1]);
    }
    return null;
  }
  if (key === "shadeVariation") {
    const match = hinted.match(/\bv\s*([1-4])(?:\s*[-–]\s*v?\s*([1-4]))?\b/i);
    if (!match) return null;
    return match[2] ? `v${match[1]}-v${match[2]}` : `v${match[1]}`;
  }
  if (key === "waterAbsorption") {
    return percentValue(cleaned);
  }
  if (key === "breakingStrength") {
    const match = cleaned.match(/(≥|>=)\s*(\d+(?:\.\d+)?)(?:\s*(lbf|lbs))?/i);
    if (!match) return null;
    const unit = match[3] ? ` ${match[3].toLowerCase()}` : /\blbf\b/i.test(hinted) ? " lbf" : "";
    return `≥ ${match[2]}${unit}`;
  }
  if (key === "scratchHardness") {
    if (!/mohs|scratch|hardness/i.test(hinted)) return null;
    const matches = [...hinted.matchAll(/(?<![\d.])(\d{1,2})(?![\d.])(?!\s*%)/g)];
    const n = matches.map((m) => Number(m[1])).find((value) => value >= 1 && value <= 10);
    return n == null ? null : String(n);
  }
  if (key === "dcof") {
    const match = cleaned.match(/(≥|>=)?\s*(0\.\d{2})/);
    if (!match) return null;
    const wet = /wet/i.test(hinted) ? " wet" : "";
    return `${match[1] ? "≥ " : ""}${match[2]}${wet}`.replace(/^>= /, "≥ ");
  }
  if (key === "chemicalResistance" || key === "stainResistance" || key === "frostResistance") {
    return resistanceValue(cleaned, label);
  }
  return null;
}

function resistanceValue(cleaned: string, label: string): string | null {
  const source = `${label} ${cleaned}`.replace(/\s+/g, " ").trim();
  if (/not\s*resistant|not applicable/i.test(source)) return null;
  if (/\bnot\b/i.test(source) && /\bresistant\b/i.test(source)) return null;
  const klass = source.match(/class\s*([a-e0-9])/i);
  if (klass) return `class ${klass[1].toLowerCase()}`;
  if (/unaffected/i.test(source)) return "unaffected";
  const body = source.replace(/\b(?:chemical|stain|frost|freeze)\s+resist\w*/gi, " ");
  if (/\b(no|n\/a)\b/i.test(body)) return null;
  if (/\bresistant\b/i.test(body)) return "resistant";
  return null;
}

function percentValue(text: string): string | null {
  const range = text.match(
    /(\d+(?:\.\d+)?)\s*%\s*<\s*wa\s*(?:≤|<=)?\s*(\d+(?:\.\d+)?)\s*%/i,
  );
  if (range) return `${trimZero(range[1])}% – ${trimZero(range[2])}%`;
  const between = text.match(/(\d+(?:\.\d+)?)\s*%\s*[–-]\s*(\d+(?:\.\d+)?)\s*%/);
  if (between) return `${trimZero(between[1])}% – ${trimZero(between[2])}%`;
  const single = text.match(/(≤|≥|<|>|<=|>=)\s*(\d+(?:\.\d+)?)\s*%/);
  if (!single) return null;
  const op = single[1].replace("<=", "≤").replace(">=", "≥");
  return `${op} ${trimZero(single[2])}%`;
}

function valueGrounded(key: keyof TechSpecs, value: string, text: string): boolean {
  const lower = value.toLowerCase();
  if (key === "shadeVariation") {
    return [...lower.matchAll(/v[1-4]/g)].every((m) => new RegExp(`\\b${m[0]}\\b`).test(text));
  }
  if (key === "thickness" || key === "waterAbsorption" || key === "breakingStrength" || key === "dcof" || key === "scratchHardness") {
    const unit =
      key === "thickness" ? "mm" : key === "waterAbsorption" ? "%" : key === "dcof" ? "" : "";
    const nums = [...value.matchAll(/\d+(?:\.\d+)?/g)].map((m) => m[0]);
    if (nums.length === 0) return false;
    return nums.every((n) => numberPresent(text, n, unit));
  }
  if (/class\s*[a-e0-9]/.test(lower)) {
    const klass = lower.match(/class\s*([a-e0-9])/)!;
    return new RegExp(`class\\s*${klass[1]}\\b`).test(text);
  }
  if (lower.includes("unaffected")) return text.includes("unaffected");
  if (lower.includes("resistant")) {
    return /frost|freeze|stain|chemical/.test(text) && text.includes("resistant") && !/not\s+resistant/.test(text);
  }
  return false;
}

function numberPresent(text: string, n: string, unit: string): boolean {
  const num = n.replace(/\.0+$/, "").replace(".", "\\.");
  const exact = n.replace(".", "\\.");
  const body = `(?<![\\d.])(?:${exact}|${num})(?![\\d.])`;
  if (!unit) return new RegExp(body).test(text);
  return new RegExp(`${body}\\s*${unit}`).test(text) || new RegExp(`${unit}\\s*\\)?\\s*${body}`).test(text);
}

function labelKey(text: string): keyof TechSpecs | null {
  for (const rule of LABEL_RULES) {
    if (rule.re.test(text)) return rule.key;
  }
  return null;
}

function isAbsent(text: string): boolean {
  return /^(?:n\/?a|-+|not applicable|no|not resistant)$/i.test(text.trim()) ||
    /\bnot applicable\b/i.test(text);
}

function isStandardCode(text: string): boolean {
  const t = text.trim();
  return /^(?:astm|iso|ansi|en)[\s.\-/0-9]*$/i.test(t) ||
    /^[a-z]{0,4}\s*\d{3,4}$/i.test(t) ||
    /^iso[.\-\s]*\d/i.test(t) ||
    /^c\d{3}$/i.test(t) ||
    /moh['’]?s?\s*scale/i.test(t);
}

function formatMm(raw: string): string {
  const n = Number(raw);
  const shown = Number.isInteger(n) ? String(n) : String(n).replace(/0+$/, "").replace(/\.$/, "");
  return `${shown}mm`;
}

function trimZero(raw: string): string {
  const n = Number(raw);
  return Number.isInteger(n) ? String(n) : String(n);
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function cluster(items: SpecTextItem[], axis: "x" | "y", tolerance: number): SpecTextItem[][] {
  const sorted = [...items].sort((a, b) => a[axis] - b[axis]);
  const groups: SpecTextItem[][] = [];
  for (const item of sorted) {
    const current = groups[groups.length - 1];
    const prev = current?.[current.length - 1];
    if (prev && item[axis] - prev[axis] <= tolerance) current.push(item);
    else groups.push([item]);
  }
  return groups;
}

function splitCells(row: SpecTextItem[]): string[] {
  const sorted = [...row].sort((a, b) => a.x - b.x);
  const cells: string[] = [];
  let buf = "";
  let lastEnd = -Infinity;
  for (const item of sorted) {
    const width = item.width ?? Math.max(8, item.str.length * 7);
    if (buf && item.x - lastEnd > 28) {
      cells.push(buf.trim());
      buf = "";
    }
    if (buf && !/[\s≤≥<>]$/.test(buf) && !/^[%.,]/.test(item.str)) buf += " ";
    buf += item.str;
    lastEnd = item.x + width;
  }
  if (buf.trim()) cells.push(buf.trim());
  return cells;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;");
}
