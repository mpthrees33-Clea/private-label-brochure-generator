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
  { key: "shadeVariation", re: /(?:shade(?:\s*and\s*texture)?|colou?r)\s*(?:variation|rating)|\bvariation\s*:/i },
  { key: "frostResistance", re: /frost\s*(?:resist|proof)|freeze\s*(?:resist|thaw)/i },
  { key: "stainResistance", re: /stain\s*resist/i },
  { key: "slipResistance", re: /slip\s*resist|ramp\s*test|din\s*51130|din\s*51097|en\s*16165/i },
  { key: "dcof", re: /d\.?\s*c\.?\s*o\.?\s*f|dynamic\s*coefficient/i },
  { key: "thickness", re: /\bthickness\b|\bspessore\b/i },
];

export interface ParsedSpecRecord {
  specs: Partial<TechSpecs>;
  standards: Partial<Record<keyof TechSpecs, string>>;
}

export function parseTechSpecs(text: string): Partial<TechSpecs> {
  return parseTechSpecsFromHtml(`<body><p>${escapeHtml(text)}</p></body>`);
}

export function parseTechSpecsFromHtml(html: string): Partial<TechSpecs> {
  return parseTechSpecsDetailed(html).specs;
}

export function parseTechSpecsDetailed(html: string): ParsedSpecRecord {
  const $ = cheerio.load(html.replace(/></g, "> <"));
  $("script, style, noscript, nav, header, footer").remove();
  const specs: Partial<TechSpecs> = {};
  const standards: Partial<Record<keyof TechSpecs, string>> = {};
  const pairValues: Partial<Record<keyof TechSpecs, string[]>> = {};

  // A product spec is a label sitting next to one value. A row of several
  // cells is a table, handled below so a sitewide comparison chart cannot
  // overwrite the product's own "Complies".
  $("div, li, dl").each((_, el) => {
    if ($(el).closest("table").length) return;
    if ($(el).parents("body").length === 0) return;
    const kids = $(el).children().toArray();
    if (kids.length < 2 || kids.length > 3) return;
    const texts = kids
      .map((kid) => $(kid).text().replace(/\s+/g, " ").trim())
      .filter(Boolean);
    if (texts.length < 2 || texts.some((part) => part.length > 80)) return;
    const key = labelKey(texts[0]);
    if (!key) return;
    if (isRequirement(texts.slice(1).join(" "))) return;
    const value = valueFor(key, texts.slice(1).join(" "), texts[0]);
    if (!value) return;
    rememberStandard(standards, key, texts.join(" "));
    const list = pairValues[key] ?? [];
    list.push(value);
    pairValues[key] = list;
  });
  for (const key of Object.keys(pairValues) as (keyof TechSpecs)[]) {
    const chosen = dominant(pairValues[key] ?? []);
    if (chosen) specs[key] = chosen;
  }

  $("table").each((_, table) => {
    const found = new Map<keyof TechSpecs, string[]>();
    $(table)
      .find("tr")
      .each((__, tr) => {
        const cells = $(tr)
          .find("th, td")
          .toArray()
          .map((cell) => $(cell).text().replace(/\s+/g, " ").trim())
          .filter(Boolean);
        const split = cells.length < 2 ? valueAfterLabel(cells[0] || "") : null;
        if (cells.length < 2 && !split) return;
        const label = split?.label ?? cells.find((cell) => labelKey(cell));
        if (!label) return;
        const key = split?.key ?? labelKey(label);
        if (!key || specs[key]) return;
        const value = split
          ? valueFor(key, split.value, label)
          : bestOf(
              key,
              cells.filter((cell) => cell !== label),
              label,
            );
        if (!value) return;
        rememberStandard(standards, key, `${label} ${cells.join(" ")}`);
        const list = found.get(key) ?? [];
        list.push(value);
        found.set(key, list);
      });
    for (const [key, values] of found) {
      if (specs[key]) continue;
      const merged = mergeRowValues(key, values);
      if (merged) specs[key] = merged;
    }
  });

  const flat = $("body").text().replace(/\s+/g, " ").trim();
  const windows = windowsFromText(flat);
  for (const key of Object.keys(windows) as (keyof TechSpecs)[]) {
    if (!specs[key] && windows[key]) specs[key] = windows[key];
  }
  applyFeatureLines(flat, specs, standards);
  applyClassRun(flat, specs);
  appendSlipRatings(flat, specs, standards);
  separateSlip(specs, standards);
  return { specs, standards };
}

function dominant(values: string[]): string | null {
  if (values.length === 0) return null;
  // "Complies" is the product's own result. A nearby chart of minimums
  // for other bodies (6mm, 2cm) must not replace it.
  if (values.some((value) => value === "complies")) return "complies";
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const total = values.length;
  const top = ranked[0];
  if (!top) return null;
  if (ranked.length === 1 || top[1] > total * 0.5) return top[0];
  const kept = ranked.filter(([, count]) => count >= total * 0.25);
  return (kept.length > 0 ? kept : [top]).map(([value]) => value).join(" | ");
}

export function parseTechSpecItems(items: SpecTextItem[]): Partial<TechSpecs> {
  return parseTechSpecItemsDetailed(items).specs;
}

export function parseTechSpecItemsDetailed(items: SpecTextItem[]): ParsedSpecRecord {
  const usable = items.filter((item) => item.str && item.str.trim());
  const specs: Partial<TechSpecs> = {};
  const standards: Partial<Record<keyof TechSpecs, string>> = {};
  Object.assign(specs, specsFromRows(cluster(usable, "y", 5)));
  Object.assign(specs, specsNearLabels(usable));
  Object.assign(specs, thicknessContinuation(usable));
  if (!specs.thickness) {
    const packed = usable
      .map((item) => item.str.trim())
      .filter((str) => /^\d+(?:[.,]\d+)?\s*mm$/i.test(str));
    const chosen = dominant(thicknessReadings(packed.join(" ")));
    if (chosen) specs.thickness = chosen;
  }
  const blob = usable.map((item) => item.str).join(" ");
  for (const key of Object.keys(specs) as (keyof TechSpecs)[]) {
    const near = standardNear(key, blob) ?? standardBesideValue(key, blob, String(specs[key] ?? ""));
    if (near) standards[key] = near;
  }
  applyFeatureLines(blob, specs, standards);
  applyClassRun(blob, specs);
  appendSlipRatings(blob, specs, standards);
  separateSlip(specs, standards);
  return { specs, standards };
}

function applyClassRun(blob: string, specs: Partial<TechSpecs>): void {
  const chemical = classRun(blob, /chemical\s*resist/i);
  if (chemical) specs.chemicalResistance = chemical;
  const stain = classRun(blob, /stain(?:ing)?\s*resist|resist\w*\s+to\s+stain/i);
  if (stain) specs.stainResistance = stain;
}

function classRun(blob: string, label: RegExp): string | null {
  const at = blob.search(label);
  if (at < 0) return null;
  const window = blob.slice(at, at + 500);
  const run = window.match(
    /\b(A|LA|HA|GA|GB|GHA)\b(?:\s*(?:\||\s)\s*\b(A|LA|HA|GA|GB|GHA)\b)+/i,
  );
  if (!run) return null;
  const tokens = unique(run[0].split(/[|\s]+/).map((part) => part.trim().toLowerCase()).filter(Boolean));
  if (tokens.length < 2 || tokens.length > 3) return null;
  return `class ${tokens.join(" / ")}`;
}

/**
 * When two sources print the same breaking strength, keep the one that
 * includes the unit the factory printed (sell sheet "≥125 lbf" over a
 * tech-sheet cell that only says "≥ 125"). Never invent a unit, and
 * never replace a different number.
 */
export function upgradeMeasuredSpec(current: string, incoming: string): string {
  const numberOf = (value: string) => value.match(/(\d+(?:\.\d+)?)/)?.[1];
  const currentNumber = numberOf(current);
  const incomingNumber = numberOf(incoming);
  if (!currentNumber || currentNumber !== incomingNumber) return current;
  const unitOf = (value: string) => value.match(/\b(lbf|lbs)\b/i)?.[1].toLowerCase();
  if (!unitOf(current) && unitOf(incoming)) return incoming.trim();
  return current;
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
  const separated = separateSlip({ ...specs });
  const out: Partial<TechSpecs> = {};
  for (const key of Object.keys(separated) as (keyof TechSpecs)[]) {
    const value = separated[key];
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
  const readings: string[] = [];
  const inchReadings: string[] = [];
  const thickRe = /(?:thickness|spessore)(?:\s*\(\s*mm\s*\))?.{0,48}/gi;
  let thick: RegExpExecArray | null;
  while ((thick = thickRe.exec(flat))) {
    const window = thick[0];
    const noted = window.match(/(\d+(?:[.,]\d+)?)\s*mm(\s*\([^)]*\))?/i);
    if (noted && isPerSizeNote(noted[2] || "")) continue;
    readings.push(...thicknessReadings(window));
    if (readings.length === 0) {
      const inches = window.match(/(?:thickness|spessore)\s*:?\s*(0\.\d{1,3})\b(?!\s*mm)/i);
      if (inches) inchReadings.push(`${inches[1]}"`);
    }
  }
  const thickness = dominant(readings) ?? (readings.length === 0 ? dominant(inchReadings) : null);
  if (thickness) specs.thickness = thickness;
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
    const fromLabel = key === "dcof" ? valueFor("dcof", labelText, labelText) : null;
    const next =
      key === "dcof"
        ? mergeRowValues(
            "dcof",
            [fromLabel, value].filter((part): part is string => !!part),
          )
        : value;
    if (!next) continue;
    if (key === "dcof" && specs.dcof) {
      specs.dcof = mergeRowValues("dcof", [specs.dcof, next]) ?? next;
    } else {
      specs[key] = next;
    }
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
  const label = items.find((item) => isProductThicknessLabel(item.str));
  if (!label) return specs;
  const mms = items
    .filter((item) => item.x >= label.x - 8 && item.x < label.x + 420)
    .filter((item) => item.y <= label.y + 8 && label.y - item.y < 40)
    .map((item) => item.str)
    .join(" ");
  const values = thicknessReadings(mms);
  if (values.length) specs.thickness = values.join(" | ");
  return specs;
}

function bestOf(key: keyof TechSpecs, cells: string[], label: string): string | null {
  // Breaking strength prints a required minimum and the factory's average
  // on the same row. The rightmost measurement is the one they claim.
  if (key === "breakingStrength") {
    let found: string | null = null;
    for (const cell of cells) {
      if (isRequirement(cell) && found) continue;
      const value = valueFor(key, cell, label);
      if (value) found = value;
    }
    return found;
  }
  const values: string[] = [];
  for (const cell of cells) {
    if (isRequirement(cell)) continue;
    const value = valueFor(key, cell, label);
    if (value) values.push(value);
  }
  return mergeRowValues(key, values);
}

function mergeRowValues(key: keyof TechSpecs, values: string[]): string | null {
  const uniqueValues = unique(values);
  if (uniqueValues.length === 0) return null;
  if (uniqueValues.length === 1) return uniqueValues[0];
  if (uniqueValues.includes("complies") && key !== "chemicalResistance" && key !== "stainResistance") {
    return "complies";
  }
  const classes = uniqueValues.filter((value) => value.startsWith("class "));
  if (classes.length >= 2 && classes.length <= 3 && classes.length === uniqueValues.length) {
    const tokens = classes.map((value) => value.replace(/^class\s+/, ""));
    return `class ${tokens.join(" / ")}`;
  }
  if (key === "breakingStrength" || key === "waterAbsorption") {
    return uniqueValues[uniqueValues.length - 1];
  }
  if (key === "dcof") {
    const parts = unique(uniqueValues.flatMap((value) => value.split(" | ")));
    return preferThresholds(parts).join(" | ");
  }
  if (key === "thickness") return dominant(uniqueValues);
  if (magnitudeSplit(uniqueValues)) return null;
  if (uniqueValues.length <= 3) return uniqueValues.join(" | ");
  return null;
}

function preferThresholds(values: string[]): string[] {
  const thresholds = values.filter((value) => value.includes("≥"));
  return thresholds.length ? thresholds : values;
}

function magnitudeSplit(values: string[]): boolean {
  const nums = values
    .map((value) => {
      const match = value.match(/\d+(?:\.\d+)?/);
      return match ? Number(match[0]) : NaN;
    })
    .filter((n) => Number.isFinite(n) && n > 0);
  if (nums.length < 2) return false;
  return Math.max(...nums) / Math.min(...nums) >= 8;
}

function valueFor(key: keyof TechSpecs, text: string, label = ""): string | null {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned || isAbsent(cleaned)) return null;
  if (isStandardCode(cleaned)) return null;
  const hinted = `${label} ${cleaned}`;
  if (key === "frostResistance" && /no\s+damages/i.test(hinted)) return "resistant";
  if (key === "frostResistance" && /not\s*resistant|\bno\b/i.test(hinted)) return null;
  if (key === "frostResistance" && /\bproof\b/i.test(hinted)) return "resistant";
  if (key === "thickness") {
    const mms = thicknessReadings(hinted);
    if (mms.length) return dominant(mms);
    if (/\(mm\)|\bmm\b/i.test(label) || /\bmm\b/i.test(cleaned)) {
      const bare = cleaned.match(/^(?:mm\s*)?(\d+(?:[.,]\d+)?)$/i);
      if (bare) {
        const n = Number(bare[1].replace(",", "."));
        if (n >= 3 && n <= 40) return formatMm(bare[1]);
      }
    }
    const inches = cleaned.match(/^(0\.\d{1,3})(?:\s*(?:in(?:ches|ch)?|["”″]))?$/i);
    if (inches && Number(inches[1]) > 0 && Number(inches[1]) < 2) return `${inches[1]}"`;
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
    if (/^complies?$/i.test(cleaned) || /^compliant$/i.test(cleaned)) return "complies";
    const matches = [...cleaned.matchAll(/(≥|>=)\s*(\d+(?:\.\d+)?)(?:\s*(lbf|lbs))?/gi)].filter(
      (match) => Number(match[2]) >= 50,
    );
    const match = matches[matches.length - 1];
    if (!match) return null;
    const hintedUnit = hinted.match(/\b(lbf|lbs)\b/i);
    const unit = match[3]
      ? ` ${match[3].toLowerCase()}`
      : hintedUnit
        ? ` ${hintedUnit[1].toLowerCase()}`
        : "";
    return `≥ ${match[2]}${unit}`;
  }
  if (key === "scratchHardness") {
    if (!/mohs|scratch|hardness/i.test(hinted)) return null;
    const declared = unique(
      [...hinted.matchAll(/(?:≥|>=)\s*(\d{1,2})\b/g)]
        .map((match) => Number(match[1]))
        .filter((n) => n >= 1 && n <= 10)
        .map((n) => `≥ ${n}`),
    );
    if (declared.length) return declared.join(" | ");
    const body = hinted
      .replace(/\brange\s*0\s*[-–]\s*10\b/gi, " ")
      .replace(/\b0\s*[-–]\s*10\b/g, " ")
      .replace(/\bv\s*[1-4]\b/gi, " ")
      .replace(/\(\s*\d{1,2}\s*\)/g, " ")
      .replace(/\b(?:19|20)\d{2}\b/g, " ")
      .replace(/\biso\s*\d+(?:[.\-/]\d+)?/gi, " ")
      .replace(/\b10545[.\-/]\d+\b/gi, " ")
      .replace(/\bastm\s*c\s*-?\s*\d+/gi, " ");
    const matches = [...body.matchAll(/(?<![\d.])(\d{1,2})(?![\d.])(?!\s*%)/g)];
    const n = matches.map((m) => Number(m[1])).find((value) => value >= 1 && value <= 10);
    return n == null ? null : String(n);
  }
  if (key === "slipResistance") {
    const phrases = rampPhrases(hinted);
    return phrases.length ? joinRamps(phrases) : null;
  }
  if (key === "dcof") {
    // BCRA ">0.40" is a different method sitting next to DCOF. Don't merge it in.
    // Some sheets extract "≥" as a leading "t" (WET DCOF t0,42).
    const clipped = cleaned
      .split(/\b(?:BCRA|DIN|ASTM|ISO|UNI)\b/i)[0]
      .replace(/(?:^|[^a-z0-9])t(?=0[.,]\d{2})/gi, (prefix) => `${prefix.slice(0, -1)}≥`);
    const matches = [...clipped.matchAll(/(≥|>=|≥)?\s*(0[.,]\d{2})/g)];
    if (matches.length === 0) return null;
    const wet = /wet/i.test(hinted) ? " wet" : "";
    const formatted = unique(
      matches.map((match) => {
        const num = match[2].replace(",", ".");
        const op = match[1] ? "≥ " : "";
        return `${op}${num}${wet}`.replace(/^>= /, "≥ ");
      }),
    );
    return preferThresholds(formatted).join(" | ");
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
  if (isRequirement(cleaned) && !/unaffected|conforme|complies|resist/i.test(cleaned)) return null;
  const frost = /frost|freeze/i.test(source);
  if (/^(?:conforme|complies?|passed?)$/i.test(cleaned)) return frost ? "resistant" : "complies";
  if (frost && /no\s+damages|frost\s*proof|\bproof\b/i.test(source)) return "resistant";
  const bare = cleaned.match(/^(GA|GB|GHA|HA|LA|[A-E])$/i);
  if (bare && /stain|chemical|resist/i.test(source)) return `class ${bare[1].toLowerCase()}`;
  // "Classe 5" is the Italian word, not class E. Require a space after class/classe.
  const klass = source.match(/\bclass(?:e)?\s+(GA|GB|GHA|HA|LA|[A-E]|[1-5])\b/i);
  if (klass && !isRequirement(cleaned)) return `class ${klass[1].toLowerCase()}`;
  if (/unaffected/i.test(source)) return "unaffected";
  const body = source.replace(/\b(?:chemical|stain|frost|freeze)\s+resist\w*/gi, " ");
  if (/\b(no|n\/a)\b/i.test(body)) return null;
  if (/\bresistant\b/i.test(body)) return "resistant";
  return null;
}

function percentValue(text: string): string | null {
  const num = "(\\d+(?:[.,]\\d+)?)";
  const approx = text.match(new RegExp(`~\\s*${num}\\s*%`, "i"));
  if (approx) return `~ ${dotNumber(approx[1])}%`;
  const range = text.match(
    new RegExp(`${num}\\s*%\\s*<\\s*wa\\s*(?:≤|<=)?\\s*${num}\\s*%`, "i"),
  );
  if (range) return `${dotNumber(range[1])}% – ${dotNumber(range[2])}%`;
  const between = text.match(new RegExp(`${num}\\s*%\\s*[–-]\\s*${num}\\s*%`));
  if (between) return `${dotNumber(between[1])}% – ${dotNumber(between[2])}%`;
  const single = text.match(new RegExp(`(≤|≥|<|>|<=|>=)\\s*${num}\\s*%`));
  if (single) {
    const op = single[1].replace("<=", "≤").replace(">=", "≥");
    return `${op} ${dotNumber(single[2])}%`;
  }
  const maximum = text.match(new RegExp(`\\bmax(?:imum)?\\s*${num}\\s*%`, "i"));
  if (maximum) return `≤ ${dotNumber(maximum[1])}%`;
  return null;
}

function valueGrounded(key: keyof TechSpecs, value: string, text: string): boolean {
  const lower = value.toLowerCase();
  if (key === "shadeVariation") return shadeGrounded(lower, text);
  if (key === "breakingStrength") {
    if (lower.includes("complies")) {
      return /break(?:ing)?\s*strength[^.]{0,80}complies/.test(text);
    }
    if (/break(?:ing)?\s*strength[^.]{0,80}complies/.test(text)) return false;
    const nums = [...value.matchAll(/\d+(?:\.\d+)?/g)].map((m) => m[0]);
    if (nums.length === 0) return false;
    return nums.every((n) => numberNear(text, n, /break(?:ing)?\s*strength/i));
  }
  if (key === "slipResistance") {
    const ratings = [...lower.matchAll(/\br\s*(\d{1,2})\b/g)].map((match) => match[1]);
    if (ratings.length === 0) return false;
    return ratings.every((n) => new RegExp(`\\br\\s*${n}\\b`).test(text));
  }
  if (key === "thickness" || key === "waterAbsorption" || key === "dcof" || key === "scratchHardness") {
    const nums = [...value.matchAll(/\d+(?:\.\d+)?/g)].map((m) => m[0]);
    if (nums.length === 0) return false;
    if (key === "thickness") {
      return nums.every((n) => thicknessGrounded(text, n));
    }
    const unit = key === "waterAbsorption" ? "%" : "";
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

function numberNear(text: string, n: string, label: RegExp): boolean {
  const body = numberBody(n);
  const ahead = new RegExp(`${label.source}[\\s\\S]{0,80}?${body}`, "i");
  const behind = new RegExp(`${body}[\\s\\S]{0,40}?${label.source}`, "i");
  return ahead.test(text) || behind.test(text);
}

function thicknessGrounded(text: string, n: string): boolean {
  const body = numberBody(n);
  const asMm = new RegExp(`${body}\\s*mm(?!\\s*[23²³](?!\\d))\\b`, "i");
  if (asMm.test(text)) return true;
  if (!/^0\.\d{1,3}$/.test(n)) return false;
  return new RegExp(`(?<!±\\s*)${body}\\s*(?:in(?:ch|ches)?|["”″])\\b`, "i").test(text);
}

function numberPresent(text: string, n: string, unit: string): boolean {
  const body = numberBody(n);
  if (!unit) return new RegExp(body).test(text);
  return new RegExp(`${body}\\s*${unit}`).test(text) || new RegExp(`${unit}\\s*\\)?\\s*${body}`).test(text);
}

function numberBody(n: string): string {
  const exact = n.replace(".", "\\.");
  const comma = n.replace(".", ",");
  const commaExact = comma.replace(".", "\\.");
  const trimmed = n.replace(/\.0+$/, "").replace(".", "\\.");
  return `(?<![\\d.])(?:${exact}|${commaExact}|${trimmed})(?![\\d.])`;
}

function valueAfterLabel(
  cell: string,
): { key: keyof TechSpecs; label: string; value: string } | null {
  for (const rule of LABEL_RULES) {
    const match = new RegExp(rule.re.source, "i").exec(cell);
    if (!match) continue;
    const value = cell.slice(match.index + match[0].length).replace(/^[\s:–-]+/, "").trim();
    if (!value || value.length > 80) continue;
    return { key: rule.key, label: match[0], value };
  }
  return null;
}

function labelKey(text: string): keyof TechSpecs | null {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length > 80) return null;
  for (const rule of LABEL_RULES) {
    if (!rule.re.test(text)) continue;
    if (rule.key === "thickness" && !isProductThicknessLabel(text)) return null;
    return rule.key;
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
  const n = Number(raw.replace(",", "."));
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

function shadeGrounded(value: string, text: string): boolean {
  const ratings = [...value.matchAll(/v([1-4])/g)].map((match) => match[1]);
  if (ratings.length === 0) return false;
  const label =
    "(?:shade(?:\\s*and\\s*texture)?|colou?r)\\s*(?:variation|rating)|(?:^|[^a-z])variation\\s*:";
  return ratings.every((n) => {
    const ahead = new RegExp(`${label}[^\\d]{0,48}\\bv\\s*${n}\\b`, "i");
    const behind = new RegExp(`\\bv\\s*${n}\\b[^\\d]{0,24}(?:shade|colou?r)\\s*(?:variation|rating)`, "i");
    return ahead.test(text) || behind.test(text);
  });
}

function isProductThicknessLabel(text: string): boolean {
  if (/thickness\s*(?:≥|>=|>|<|≤|<=)/i.test(text)) return false;
  return /\b(?:thickness|spessore)\b/i.test(text);
}

function thicknessReadings(text: string): string[] {
  // "S ≥ 1300 N (thickness ≥ 7,5 mm)" is the test condition, not the tile.
  // "± 0.040 in" is a tolerance. "40 mm3" is an abrasion volume.
  const body = text
    .replace(/thickness\s*(?:≥|>=|>|<|≤|<=)\s*\d+(?:[.,]\d+)?\s*mm/gi, " ")
    .replace(/±\s*\d+(?:[.,]\d+)?\s*(?:mm|in(?:ch|ches)?)/gi, " ");
  const out: string[] = [];
  const re = /(?<![\d.,])(\d+(?:[.,]\d+)?)\s*mm(?!\s*[23²³](?!\d))/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(body))) {
    const before = body.slice(Math.max(0, match.index - 2), match.index);
    if (/[±]/.test(before)) continue;
    const n = Number(match[1].replace(",", "."));
    if (!Number.isFinite(n) || n < 3 || n > 40) continue;
    out.push(formatMm(match[1]));
  }
  return unique(out);
}

function isRequirement(cell: string): boolean {
  return /\b(min(?:imo|imum)?|required|requisiti|as reported)\b/i.test(cell);
}

function rememberStandard(
  standards: Partial<Record<keyof TechSpecs, string>>,
  key: keyof TechSpecs,
  text: string,
): void {
  if (standards[key]) return;
  const standard = citedStandard(text);
  if (standard && standardFits(key, standard)) standards[key] = standard;
}

/** The test method printed next to a value. Not a relabeling of another method. */
function standardsIn(text: string): string[] {
  const found: string[] = [];
  const splitRe = /UNI\s+EN\s+ISO[\s\S]{0,80}?10545\s*[./-]\s*(\d+)/gi;
  let split: RegExpExecArray | null;
  while ((split = splitRe.exec(text))) found.push(tidyStandard(`UNI EN ISO 10545-${split[1]}`));
  const re =
    /(?:UNI\s+EN\s+ISO|ISO)\s*10545[.\-/]\s*\d+|ASTM\s*C-?\s*\d+|ANSI\s*A\s*\d+(?:\.\d+)?|DIN(?:\s+EN)?\s*\d+|EN\s*16165/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) found.push(tidyStandard(match[0]));
  return unique(found);
}

export function citedStandard(text: string): string | null {
  const uni = text.match(/UNI\s+EN\s+ISO\s*10545[.\-/]\s*\d+/i);
  if (uni) return tidyStandard(uni[0]);
  const iso = text.match(/ISO\s*10545[.\-/]\s*\d+/i);
  if (iso) return tidyStandard(iso[0]);
  const astm = text.match(/ASTM\s*C-?\s*\d+/i);
  if (astm) return tidyStandard(astm[0]);
  const ansi = text.match(/ANSI\s*A\s*\d+(?:\.\d+)?/i);
  if (ansi) return tidyStandard(ansi[0]);
  const din = text.match(/DIN(?:\s+EN)?\s*\d+/i);
  if (din) return tidyStandard(din[0]);
  return null;
}

function standardBesideValue(key: keyof TechSpecs, blob: string, value: string): string | null {
  const num = value.match(/(\d+(?:[.,]\d+)?)/)?.[1];
  if (!num || !value.includes("%")) return null;
  const re = new RegExp(`(?:>|≥|≤|<)\\s*${num.replace(".", "[.,]")}\\s*%`, "g");
  let match: RegExpExecArray | null;
  while ((match = re.exec(blob))) {
    const window = blob.slice(match.index, match.index + 70);
    const standard = standardsIn(window).find((candidate) => standardFits(key, candidate));
    if (standard) return standard;
  }
  return null;
}

export function standardNear(key: keyof TechSpecs, text: string): string | null {
  const rule = LABEL_RULES.find((item) => item.key === key);
  if (!rule) return null;
  const re = new RegExp(rule.re.source, "ig");
  let match: RegExpExecArray | null;
  const found: string[] = [];
  while ((match = re.exec(text))) {
    const after = text.slice(match.index, match.index + match[0].length + 280);
    const before = text.slice(Math.max(0, match.index - 60), match.index);
    const fitting = unique(
      [...standardsIn(after), ...standardsIn(before)].filter(
        (candidate) => standardFits(key, candidate) && plausibleStandard(candidate),
      ),
    );
    if (!fitting.length) continue;
    const measured =
      /[≤≥]|0[.,]\d{2}|\bR\s*(?:9|1[0-3])\b|\bclass(?:e)?\s+[a-e0-9]\b|\bresistant\b|\bunaffected\b|\bcomplies\b|\bconforme\b|\d+(?:[.,]\d+)?\s*(?:%|mm)\b/i.test(
        `${before} ${after}`,
      );
    if (!measured) continue;
    found.push(...fitting);
  }
  const choices = unique(found);
  if (key === "dcof") {
    const specific = choices.find((candidate) => /326\.3/.test(candidate));
    if (specific) return specific;
  }
  return choices.length ? choices.slice(0, 2).join(" / ") : null;
}

function plausibleStandard(standard: string): boolean {
  const ansi = standard.match(/ANSI\s*A\s*(\d+)/i);
  if (ansi && ansi[1].length < 3) return false;
  const astm = standard.match(/ASTM\s*C-?\s*(\d+)/i);
  if (astm && astm[1].length < 3) return false;
  return true;
}

function tidyStandard(raw: string): string {
  return raw
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b(uni|en|iso|astm|ansi|din)\b/gi, (word) => word.toUpperCase())
    .replace(/ANSI\s+A\s+(\d)/i, "ANSI A$1")
    .replace(/(10545)\s*[./-]\s*/gi, "$1-");
}

function standardFits(key: keyof TechSpecs, standard: string): boolean {
  if (/DIN|16165/i.test(standard)) return key === "slipResistance";
  if (/10545|ASTM\s*C|A\s*326|A\s*137/i.test(standard)) {
    return keyForStandard(standard) === key;
  }
  return true;
}

function keyForStandard(standard: string): keyof TechSpecs | null {
  const part = standard.match(/10545[.\-/]\s*(\d+)/i)?.[1];
  if (part && ISO_PART[part]) return ISO_PART[part];
  if (/C-?\s*373\b/i.test(standard)) return "waterAbsorption";
  if (/C-?\s*648\b/i.test(standard)) return "breakingStrength";
  if (/C-?\s*1026\b/i.test(standard)) return "frostResistance";
  if (/C-?\s*650\b/i.test(standard)) return "chemicalResistance";
  if (/C-?\s*499\b/i.test(standard)) return "thickness";
  if (/A\s*326\.3|A\s*137\.1/i.test(standard)) return "dcof";
  if (/51130|51097|16165/.test(standard)) return "slipResistance";
  return null;
}

const ISO_PART: Partial<Record<string, keyof TechSpecs>> = {
  "3": "waterAbsorption",
  "4": "breakingStrength",
  "12": "frostResistance",
  "13": "chemicalResistance",
  "14": "stainResistance",
};

function applyFeatureLines(
  flat: string,
  specs: Partial<TechSpecs>,
  standards: Partial<Record<keyof TechSpecs, string>>,
): void {
  const re =
    /((?:UNI\s+EN\s+)?ISO\s*10545[.\-/]\s*\d+|DIN(?:\s+EN)?\s*\d+|ANSI\s*A\s*\d+(?:\.\d+)?)(?:\s*\([^)]{0,24}\))?\s*:\s*([\s\S]{1,60}?)(?=\s+(?:UNI\b|ISO\b|DIN\b|ANSI\b|BCRA\b)|$)/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(flat))) {
    const standard = tidyStandard(match[1]);
    const rawValue = match[2].replace(/\s+/g, " ").trim();
    const part = standard.match(/10545[.\-/]\s*(\d+)/i)?.[1];
    let key: keyof TechSpecs | null = part ? ISO_PART[part] ?? null : null;
    if (/ANSI/i.test(standard) && /dcof|friction|0[.,]\d{2}/i.test(`${standard} ${rawValue}`)) key = "dcof";
    if (/DIN/i.test(standard) && /\bR\s*\d{1,2}\b/i.test(rawValue)) key = "slipResistance";
    if (!key) continue;
    const value = featureValue(key, rawValue);
    if (!value) continue;
    if (key === "dcof" && specs.dcof && specs.dcof !== value) {
      specs.dcof = mergeRowValues("dcof", [specs.dcof, value]) ?? value;
    } else if (key === "slipResistance" && specs.slipResistance && specs.slipResistance !== value) {
      specs.slipResistance = joinRamps(unique([...rampPhrases(specs.slipResistance), ...rampPhrases(value)]));
    } else {
      specs[key] = value;
    }
    const prev = standards[key];
    standards[key] = prev && !prev.includes(standard) ? `${prev} / ${standard}` : standard;
  }
  if (!specs.thickness) {
    const cluster = thicknessCluster(flat);
    if (cluster) specs.thickness = cluster;
  }
}

function appendSlipRatings(
  flat: string,
  specs: Partial<TechSpecs>,
  standards: Partial<Record<keyof TechSpecs, string>>,
): void {
  const found: string[] = [];
  const cited: string[] = [];
  const re = /slip\s*resistance|en\s*16165|din\s*(?:en\s*)?(?:51130|51097)/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(flat))) {
    const window = flat.slice(Math.max(0, match.index - 40), match.index + 120);
    found.push(...rampPhrases(window));
    for (const standard of standardsIn(window)) {
      if (/DIN|16165/i.test(standard)) cited.push(standard);
    }
  }
  if (found.length) {
    const already = specs.slipResistance ? rampPhrases(specs.slipResistance) : [];
    specs.slipResistance = joinRamps(unique([...already, ...found]));
  }
  if (cited.length && !standards.slipResistance) standards.slipResistance = unique(cited)[0];
}

function rampPhrases(value: string): string[] {
  const out: string[] = [];
  const re = /\b(matte|grip|natural|structured|polished|textured)?\s*(?:≥\s*)?R\s*(\d{1,2})(?:\s*([A-C]))?\b/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(value))) {
    const n = Number(match[2]);
    if (n < 9 || n > 13) continue;
    const finish = match[1] ? `${match[1].toLowerCase()} ` : "";
    const letter = match[3] ? ` ${match[3].toUpperCase()}` : "";
    out.push(`${finish}R${n}${letter}`);
  }
  return out;
}

function joinRamps(phrases: string[]): string {
  const list = unique(phrases);
  if (list.length === 0) return "";
  if (list.some((phrase) => phrase.includes(" "))) return list.join(" | ");
  return list.join(" · ");
}

function dcofWithoutRamps(value: string): string | null {
  const stripped = value
    .replace(/\b(?:matte|grip|natural|structured|polished|textured)\s+(?:≥\s*)?R\s*\d{1,2}(?:\s*[A-C])?\b/gi, " ")
    .replace(/\bR\s*\d{1,2}(?:\s*[A-C])?\b/gi, " ");
  const parts = stripped
    .split(/\s*(?:\||·)\s*/)
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter((part) => /0[.,]\d{2}/.test(part))
    .map((part) => part.replace(/(\d),(\d)/, "$1.$2"));
  const kept = unique(parts);
  return kept.length ? kept.join(" | ") : null;
}

/** R9–R13 are DIN ramp ratings. Wet DCOF stays a coefficient. */
function separateSlip(
  specs: Partial<TechSpecs>,
  standards?: Partial<Record<keyof TechSpecs, string>>,
): Partial<TechSpecs> {
  const ramps = [
    ...(specs.slipResistance ? rampPhrases(specs.slipResistance) : []),
    ...(specs.dcof ? rampPhrases(specs.dcof) : []),
  ];
  if (specs.dcof) {
    const numeric = dcofWithoutRamps(specs.dcof);
    if (numeric) specs.dcof = numeric;
    else delete specs.dcof;
  }
  const slip = joinRamps(unique(ramps));
  if (slip) specs.slipResistance = slip;
  else delete specs.slipResistance;
  if (standards?.dcof && specs.slipResistance) {
    const parts = standards.dcof.split(/\s*\/\s*/);
    const din = parts.filter((part) => /DIN|16165/i.test(part));
    const rest = parts.filter((part) => !/DIN|16165/i.test(part));
    if (din.length) {
      const prev = standards.slipResistance;
      standards.slipResistance = unique([prev, ...din].filter((part): part is string => !!part)).join(" / ");
      if (rest.length) standards.dcof = rest.join(" / ");
      else delete standards.dcof;
    }
  }
  return specs;
}

function featureValue(key: keyof TechSpecs, raw: string): string | null {
  if (key === "frostResistance") {
    if (/resist|conforme|pass/i.test(raw)) return "resistant";
    return null;
  }
  if (key === "chemicalResistance" || key === "stainResistance") {
    const klass = raw.match(/^(GA|GB|GHA|HA|LA|[A-E]|[1-5])\b/i);
    if (klass) return `class ${klass[1].toLowerCase()}`;
    return resistanceValue(raw, key === "chemicalResistance" ? "chemical resistance" : "stain resistance");
  }
  if (key === "dcof") {
    const nums = [...raw.matchAll(/(≥|>=)?\s*(0[.,]\d{2})/g)].map((item) => {
      const op = item[1] ? "≥ " : "";
      return `${op}${item[2].replace(",", ".")}`;
    });
    return nums.length ? unique(nums).join(" | ") : null;
  }
  if (key === "slipResistance") {
    const phrases = rampPhrases(raw);
    return phrases.length ? joinRamps(phrases) : null;
  }
  if (key === "waterAbsorption") return percentValue(raw);
  if (key === "breakingStrength") return valueFor("breakingStrength", raw, "breaking strength");
  return null;
}

function thicknessCluster(flat: string): string | null {
  const anchor = flat.search(/ISO\s*10545|UNI\s+EN\s+ISO/i);
  if (anchor < 0) return null;
  const window = flat.slice(Math.max(0, anchor - 80), anchor);
  const readings = thicknessReadings(window);
  if (readings.length === 0 || readings.length > 3) return null;
  return readings.join(" | ");
}

function dotNumber(raw: string): string {
  const n = Number(raw.replace(",", "."));
  return Number.isInteger(n) ? String(n) : String(n);
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;");
}
