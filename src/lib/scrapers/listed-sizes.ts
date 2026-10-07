import * as cheerio from "cheerio";
import type { Element } from "domhandler";
import { nominalSheetLabel, parseSizeLabel } from "./size-format";

// Sizes the factory actually printed. Headings like "Wall Tile - 4x16"
// are one layout; other sites put "3X12" in a card, "4x4 mosaic" in a
// spec table, or "7.5x40" in the swatch filename. Anything not found
// here was not on the page — the model is not allowed to add it.

export interface ListedFormat {
  /** Text parseSizeLabel can read, including bullnose / mosaic / deco. */
  raw: string;
  /** Mesh sheet, e.g. `12" x 12"`, when this format is a mounted mosaic. */
  sheetRaw?: string;
}

const SIZE_RE =
  /(\d+(?:[._]\d{1,2})?)\s*["”″]?\s*[x×]\s*(\d+(?:[._]\d{1,2})?)\s*["”″]?\s*(cm|mm)?/gi;

const LISTING_CUE =
  /\b(format|sizes?|available|nominal|bullnose|pencil|mosaic|trapezoid|deco|chevron|paver|field|sheet)\b/i;

export function extractListedFormats(html: string): ListedFormat[] {
  const $ = cheerio.load(html);
  $(
    "script, style, noscript, svg, nav, header, footer, aside, " +
      "[role=navigation], [role=banner], [role=contentinfo], " +
      "blog-post-card, [class*='blog'], [class*='news'], [class*='announcement']",
  ).remove();

  const found: ListedFormat[] = [];
  const sheetKeys = new Set<string>();

  $("table").each((_, table) => {
    for (const format of formatsFromTable($, table)) {
      found.push(format);
      if (format.sheetRaw) sheetKeys.add(dimKey(format.sheetRaw));
    }
  });

  $("body")
    .find("*")
    .addBack()
    .contents()
    .each((_, el) => {
      if (el.type !== "text") return;
      if ($(el).closest("table").length) return;
      const text = ($(el).text() || "").replace(/\s+/g, " ").trim();
      if (!text || text.length > 180) return;
      if (/\b(chip|sample)\b/i.test(text)) return;
      if (/\bnow available\b|\bread\b/i.test(text)) return;
      const standalone = text.length <= 40;
      if (!standalone && !LISTING_CUE.test(text)) return;
      for (const format of formatsInText(text)) {
        if (format.sheetRaw) {
          sheetKeys.add(dimKey(format.sheetRaw));
          continue;
        }
        if (sheetKeys.has(dimKey(format.raw))) continue;
        if (onlyInThicknessNote(text)) continue;
        found.push(format);
      }
    });

  $("img").each((_, el) => {
    const src = $(el).attr("src") || $(el).attr("data-src") || "";
    const alt = $(el).attr("alt") || "";
    if (/room|bath|hero|slider|lifestyle|ambient|logo|icon/i.test(`${src} ${alt}`)) return;
    const fromName = formatFromFilename(src);
    if (fromName) found.push(fromName);
  });

  return dedupe(found);
}

/** "12\"x12\" Mesh-Mounted" on a SKU page. */
export function meshSheetFromHtml(html: string): string | null {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");
  const match = text.match(
    /(\d+(?:\.\d+)?\s*["”″]?\s*[x×]\s*\d+(?:\.\d+)?\s*["”″]?)\s*mesh[-\s]?mounted/i,
  );
  if (!match) return null;
  return nominalSheetLabel(match[1]);
}

function formatsFromTable(
  $: cheerio.CheerioAPI,
  table: Element,
): ListedFormat[] {
  const rows = $(table)
    .find("tr")
    .toArray()
    .map((tr) =>
      $(tr)
        .find("th, td")
        .toArray()
        .map((cell) => $(cell).text().replace(/\s+/g, " ").trim()),
    )
    .filter((row) => row.some(Boolean));
  if (rows.length < 2) return [];

  const nominalIdx = rows.findIndex((row) =>
    /size\s*\(nominal\)|nominal size|chip size/i.test(row[0] || ""),
  );
  const actualIdx = rows.findIndex((row) =>
    /size\s*\(actual\)|actual size|sheet size/i.test(row[0] || ""),
  );
  if (nominalIdx >= 0) {
    const header = rows[0];
    const out: ListedFormat[] = [];
    for (let col = 1; col < Math.max(header.length, rows[nominalIdx].length); col++) {
      const title = header[col] || "";
      const nominal = rows[nominalIdx][col] || "";
      const actual = actualIdx >= 0 ? rows[actualIdx][col] || "" : "";
      const mosaic = /mosaic|trapezoid/i.test(`${title} ${nominal} ${actual}`);
      const raw = dimKey(nominal)
        ? `${nominal}${mosaic ? " mosaic" : ""}`
        : mosaic
          ? title || nominal
          : "";
      if (!raw.trim()) continue;
      out.push({
        raw: raw.trim(),
        sheetRaw: mosaic && dimKey(actual) ? actual : undefined,
      });
    }
    return out;
  }

  const headers = rows[0].map((cell) => cell.toLowerCase());
  const typeIdx = headers.findIndex((cell) => cell === "type");
  const sizeIdx = headers.findIndex((cell) => cell === "size");
  if (typeIdx < 0 || sizeIdx < 0) return [];
  return rows.slice(1).flatMap((row) => {
    const type = row[typeIdx] || "";
    const size = row[sizeIdx] || "";
    if (!type || !size || !dimKey(size)) return [];
    return [{ raw: `${type} ${size}` }];
  });
}

function formatsInText(text: string): ListedFormat[] {
  const out: ListedFormat[] = [];
  const re = new RegExp(SIZE_RE.source, "gi");
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    const raw = match[0];
    const after = text.slice(match.index + raw.length, match.index + raw.length + 24);
    const before = text.slice(Math.max(0, match.index - 24), match.index);
    const around = `${before} ${raw} ${after}`;
    if (/mesh[-\s]?mounted/i.test(after)) {
      out.push({ raw, sheetRaw: raw });
      continue;
    }
    const piece = pieceWord(around);
    out.push({ raw: piece ? `${raw} ${piece}` : raw });
  }
  return out;
}

function pieceWord(text: string): string {
  if (/\bbullnose\b|\bpencil\b|\blistello\b/i.test(text)) return "bullnose";
  if (/\btrapezoids?\b/i.test(text)) return "trapezoid mosaic";
  if (/\bmosaics?\b/i.test(text)) return "mosaic";
  if (/\bchevron\b/i.test(text)) return "chevron";
  if (/\bpaver\b/i.test(text)) return "paver";
  if (/\bdeco(?:rative|r)?\b/i.test(text)) return "deco";
  return "";
}

function formatFromFilename(url: string): ListedFormat | null {
  const file = url.split("?")[0].split("/").pop() || "";
  const match = file.match(/(?:^|[_\-/])(\d+(?:_\d{1,2})?)[x×](\d+(?:_\d{1,2})?)(?=[_\-/.]|$)/i);
  if (!match) return null;
  const a = Number(match[1].replace("_", "."));
  const b = Number(match[2].replace("_", "."));
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  if (Math.max(a, b) > 150) return null;
  return { raw: `${match[1].replace("_", ".")}x${match[2].replace("_", ".")}` };
}

function onlyInThicknessNote(text: string): boolean {
  return /\d+(?:\.\d+)?\s*mm\s*\(/i.test(text) && !LISTING_CUE.test(text);
}

function dimKey(raw: string): string {
  const match = raw.match(
    /(\d+(?:[._]\d+)?)\s*["”″]?\s*[x×]\s*(\d+(?:[._]\d+)?)/i,
  );
  if (!match) return "";
  const parsed = parseSizeLabel(match[0]);
  if (!parsed || parsed.widthIn <= 0) return "";
  return `${parsed.widthIn}x${parsed.heightIn}`;
}

function dedupe(formats: ListedFormat[]): ListedFormat[] {
  const sheets: string[] = [];
  const byKey = new Map<string, ListedFormat>();
  for (const format of formats) {
    const sheet = format.sheetRaw ? nominalSheetLabel(format.sheetRaw) : null;
    const meshOnly = Boolean(
      format.sheetRaw && format.raw.trim() === format.sheetRaw.trim(),
    );
    if (meshOnly) {
      if (sheet) sheets.push(sheet);
      continue;
    }
    const parsed = parseSizeLabel(format.raw);
    const key = parsed
      ? `${parsed.label}|${parsed.isDeco ? "deco" : "field"}`
      : format.raw.toLowerCase();
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, { raw: format.raw, sheetRaw: sheet ?? undefined });
      continue;
    }
    if (!prev.sheetRaw && sheet) prev.sheetRaw = sheet;
  }
  const rows = [...byKey.values()];
  const loneSheet = sheets.length === 1 ? sheets[0] : null;
  if (loneSheet) {
    for (const row of rows) {
      const parsed = parseSizeLabel(row.raw);
      if (parsed?.piece === "mosaic" && !row.sheetRaw) row.sheetRaw = loneSheet;
    }
  }
  return rows;
}
