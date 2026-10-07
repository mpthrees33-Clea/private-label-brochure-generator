import * as cheerio from "cheerio";
import type { AnyNode, Element } from "domhandler";
import { INCH_MARK, nominalSheetLabel, parseSizeLabel } from "./size-format";

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

const SIZE_RE = new RegExp(
  `(\\d+(?:\\s+\\d+\\s*\\/\\s*\\d+|[.,_]\\d{1,2})?)\\s*${INCH_MARK}?\\s*[x×]\\s*(\\d+(?:\\s+\\d+\\s*\\/\\s*\\d+|[.,_]\\d{1,2})?)\\s*${INCH_MARK}?\\s*(cm|mm)?`,
  "gi",
);

const LISTING_CUE =
  /\b(format|sizes?|available|nominal|bullnose|pencil|mosaic|trapezoid|deco|chevron|paver|field|sheet)\b/i;

export function extractListedFormats(html: string): ListedFormat[] {
  const $ = cheerio.load(html.replace(/></g, "> <"));
  const words = collectionWords($);
  $(
    "script, style, noscript, svg, nav, header, footer, aside, " +
      "[role=navigation], [role=banner], [role=contentinfo], " +
      "blog-post-card",
  ).remove();
  // Theme stylesheets put "blog-layout" on <body>. That is not a blog post,
  // and removing it deletes the product tables with it.
  $("[class*='menu-item']").remove();
  $("[class*='blog'], [class*='news'], [class*='announcement']").each((_, el) => {
    if (el.type !== "tag") return;
    const tag = el.tagName.toLowerCase();
    if (tag === "html" || tag === "body" || tag === "main") return;
    $(el).remove();
  });

  const found: ListedFormat[] = [];
  const sheetKeys = new Set<string>();

  $("table").each((_, table) => {
    for (const format of formatsFromTable($, table)) {
      found.push(format);
      if (format.sheetRaw) sheetKeys.add(dimKey(format.sheetRaw));
    }
  });

  $("p, td, li, span, h3, h4").each((_, el) => {
    if ($(el).find("p, td, li, table").length > 0) return;
    const text = $(el).text().replace(/\s+/g, " ").trim();
    if (text.length < 4 || text.length > 80) return;
    if (!/\d\s*[x×]\s*\d+[.,]?\d*\s*cm\b/i.test(text)) return;
    if (!/["”″′'’]|\/\d/.test(text)) return;
    if (skipForeignSize($, el, words)) return;
    found.push({ raw: text });
  });

  $("body")
    .find("*")
    .addBack()
    .contents()
    .each((_, el) => {
      if (el.type !== "text") return;
      if ($(el).closest("table").length) return;
      if (skipForeignSize($, el, words)) return;
      const text = ($(el).text() || "").replace(/\s+/g, " ").trim();
      if (!text || text.length > 500) return;
      if (/\bsample\b/i.test(text)) return;
      if (/\bchip\b/i.test(text) && !/\bchip\s*size\b/i.test(text)) return;
      if (/\bnow available\b|\bread\b/i.test(text)) return;
      // A comma-separated size line is a list even when it is longer than
      // one label. A sentence that merely mentions a format ("the large
      // 120x120 format") is not. A long color line can still print real
      // inch sizes ("24\"x48\" ... SILK JUTE").
      const leftoverWords = text
        .replace(new RegExp(SIZE_RE.source, "gi"), " ")
        .replace(/[^a-z0-9]+/gi, " ")
        .trim()
        .split(/\s+/)
        .filter(Boolean);
      const strict = leftoverWords.length > 6 || text.length > 180;
      const sizeList = leftoverWords.length <= 2;
      if (!strict && !sizeList && text.length > 40 && !LISTING_CUE.test(text)) return;
      for (const format of formatsInText(text)) {
        if (strict && !/["”″′'’]|(?:bullnose|mosaic|covebase|deco)\b/i.test(format.raw)) continue;
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
    if (skipForeignSize($, el, words)) return;
    const src = $(el).attr("src") || $(el).attr("data-src") || "";
    const alt = $(el).attr("alt") || "";
    if (/room|bath|hero|slider|lifestyle|ambient|logo|icon/i.test(`${src} ${alt}`)) return;
    // A photo of a named special (3D hexagon, battiscopa) is not a new chart size.
    if (/\b(hexagons?|battiscopa|scalino|angolare|composizione)\b/i.test(`${src} ${alt}`)) return;
    // A related-collection photo ("Prestigio_75x150") is not this collection's chart.
    if (words.length) {
      const href = $(el).closest("a").attr("href") || "";
      const blob = `${src} ${alt} ${href}`.toLowerCase();
      if (!words.some((word) => blob.includes(word))) return;
    }
    const fromName = formatFromFilename(src);
    if (fromName) found.push(fromName);
  });

  return dedupe(dropBareMetricTwins(found));
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

  const out: ListedFormat[] = [];
  const nominalIdx = rows.findIndex(
    (row) =>
      row.filter(Boolean).length > 1 &&
      /size\s*\(nominal\)|nominal size|^chip size$/i.test((row[0] || "").trim()),
  );
  const actualIdx = rows.findIndex((row) =>
    /size\s*\(actual\)|actual size|sheet size/i.test(row[0] || ""),
  );
  if (nominalIdx >= 0) {
    const header = rows[0];
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
  }

  const pieces = pieceRows(rows);
  out.push(...pieces);
  // Colour | 24"x48" | 24" x 24" — the formats are the column titles.
  for (const cell of rows[0] ?? []) {
    if (!dimKey(cell)) continue;
    if (!/["”″′'’]|cm|mm/i.test(cell)) continue;
    out.push({ raw: cell });
  }
  out.push(...labeledSizeCells(rows));

  const headers = rows[0].map((cell) => cell.toLowerCase().trim());
  const typeIdx = headers.findIndex((cell) => cell === "type");
  const sizeIdx = headers.findIndex((cell) => cell === "size" || cell === "sizes");
  if (sizeIdx >= 0) {
    const claimed = new Set(out.map((format) => dimKey(format.raw)).filter(Boolean));
    for (const row of rows.slice(1)) {
      const size = (row[sizeIdx] || "").trim();
      const key = dimKey(size);
      if (!key || claimed.has(key)) continue;
      const type = typeIdx >= 0 ? (row[typeIdx] || "").trim() : "";
      if (typeIdx >= 0 && !type) continue;
      out.push({ raw: type ? `${type} ${size}` : size });
      claimed.add(key);
    }
  }
  return out;
}

/** "Chip Size (inches): 7.87x7.87" lives in one cell, not two columns.
 *  A sheet-size line is the mount for that chip, not a second field size. */
function labeledSizeCells(rows: string[][]): ListedFormat[] {
  const chips: ListedFormat[] = [];
  const sheets: string[] = [];
  for (const row of rows) {
    const cells = row.map((cell) => cell.trim()).filter(Boolean);
    if (cells.length === 0 || cells.length > 2) continue;
    const cell = cells.join(" ");
    if (!/chip\s*size|nominal\s*size|actual\s*size|sheet\s*size/i.test(cell)) continue;
    if (!/\d\s*[x×]\s*\d/.test(cell)) continue;
    const formats = formatsInText(cell);
    if (/\bsheet\s*size\b/i.test(cell) && !/\bchip\s*size\b/i.test(cell)) {
      for (const format of formats) sheets.push(format.raw);
      continue;
    }
    chips.push(...formats);
  }
  if (chips.length === 0) return sheets.map((raw) => ({ raw }));
  if (sheets.length === 1) {
    const sheetKey = dimKey(sheets[0]);
    for (const chip of chips) {
      if (!chip.sheetRaw && dimKey(chip.raw) !== sheetKey) chip.sheetRaw = sheets[0];
    }
  }
  return chips;
}

function pieceRows(rows: string[][]): ListedFormat[] {
  const out: ListedFormat[] = [];
  for (const row of rows) {
    const cells = row.map((cell) => cell.trim()).filter(Boolean);
    const nameCell = cells.find(
      (cell) =>
        /\b(mosaic|bullnose|basket\s*weave|basketweave|pencil|chevron|paver|deco)\b/i.test(cell) &&
        cell.length < 40,
    );
    const sizeCell = cells.find((cell) => cell !== nameCell && cell.length < 30 && dimKey(cell));
    if (!nameCell || !sizeCell) continue;
    const chip = nameCell.match(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)/);
    if (chip && dimKey(sizeCell) !== dimKey(chip[0])) {
      out.push({ raw: nameCell, sheetRaw: sizeCell });
      continue;
    }
    out.push({ raw: `${nameCell} ${sizeCell}` });
  }
  return out;
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
    const inch =
      /^\s*(in(?:ches|ch)?)\b/i.exec(after) ||
      /\(?(in(?:ches|ch)?)\)?\s*:?\s*$/i.exec(before);
    const metric = inch ? null : /\(?(cm|mm)\)?\s*:?\s*$/i.exec(before);
    const withUnit = inch ? `${raw} in` : metric ? `${raw} ${metric[1]}` : raw;
    out.push({ raw: piece ? `${withUnit} ${piece}` : withUnit });
  }
  return out;
}

function pieceWord(text: string): string {
  if (/\bchip\s*size\b/i.test(text)) return "mosaic";
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
  const piece = /mosaic|basket/i.test(file)
    ? " mosaic"
    : /bullnose|pencil/i.test(file)
      ? " bullnose"
      : "";
  return { raw: `${match[1].replace("_", ".")}x${match[2].replace("_", ".")}${piece}` };
}

function onlyInThicknessNote(text: string): boolean {
  return /\d+(?:\.\d+)?\s*mm\s*\(/i.test(text) && !LISTING_CUE.test(text);
}

const GENERIC_COLLECTION_WORDS = new Set([
  "collection",
  "series",
  "tile",
  "tiles",
  "ceramic",
  "ceramics",
  "porcelain",
  "mosaic",
  "mosaics",
  "floor",
  "wall",
  "product",
  "products",
]);

function collectionWords($: cheerio.CheerioAPI): string[] {
  const h1 = $("h1").first().text().replace(/\s+/g, " ").trim();
  return h1
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 4 && !GENERIC_COLLECTION_WORDS.has(word));
}

/** Lifestyle galleries list every product "in this image", including other collections. */
function skipForeignSize(
  $: cheerio.CheerioAPI,
  el: AnyNode,
  words: string[],
): boolean {
  if (words.length === 0) return false;
  const start = el.type === "text" ? $(el).parent().get(0) : el;
  if (!start || start.type !== "tag") return false;
  const title = galleryProductTitle($, start);
  if (title == null) return false;
  if (!title) return true;
  const hay = title.toLowerCase();
  return !words.some((word) => hay.includes(word));
}

function galleryProductTitle($: cheerio.CheerioAPI, start: AnyNode): string | null {
  let node = $(start);
  let inGallery = false;
  for (let depth = 0; depth < 8 && node.length; depth += 1) {
    if (node.is("body, html")) break;
    const text = node.text();
    if (text.length > 15000) break;
    if (/in this image/i.test(text)) {
      inGallery = true;
      break;
    }
    node = node.parent();
  }
  if (!inGallery) return null;

  let cur = $(start);
  for (let step = 0; step < 12; step += 1) {
    const prev = cur.prev();
    if (!prev.length) {
      cur = cur.parent();
      if (!cur.length || cur.is("body, html")) return "";
      continue;
    }
    cur = prev;
    const title = cur.text().replace(/\s+/g, " ").trim();
    if (!title || title.length > 80) continue;
    if (/^in this image$/i.test(title)) return "";
    if (/^(size|code|technology|thickness|use|technical characteristics)\s*:?$/i.test(title)) continue;
    if (/\d\s*[x×]\s*\d/.test(title)) continue;
    if (!/[a-z]/i.test(title)) continue;
    return title;
  }
  return "";
}

/** 6x24 next to 6x24cm is the same format, not 6 inches by 24 inches. */
function dropBareMetricTwins(formats: ListedFormat[]): ListedFormat[] {
  const metric = new Set(
    formats
      .map((format) => metricPairKey(format.raw))
      .filter((key): key is string => Boolean(key)),
  );
  if (metric.size === 0) return formats;
  return formats.filter((format) => {
    const bare = barePairKey(format.raw);
    return !(bare && metric.has(bare));
  });
}

function metricPairKey(raw: string): string | null {
  const match = raw.match(/(\d+(?:[._]\d+)?)\s*[x×]\s*(\d+(?:[._]\d+)?)\s*(cm|mm)\b/i);
  if (!match) return null;
  return `${match[1].replace("_", ".")}x${match[2].replace("_", ".")}`;
}

function barePairKey(raw: string): string | null {
  const match = raw.trim().match(/^(\d+(?:[._]\d+)?)\s*[x×]\s*(\d+(?:[._]\d+)?)(?:\s|$)/i);
  if (!match) return null;
  if (/cm|mm|in(?:ch|ches)?|["”″′'’]/i.test(raw)) return null;
  return `${match[1].replace("_", ".")}x${match[2].replace("_", ".")}`;
}

function dimKey(raw: string): string {
  const match = raw.match(
    new RegExp(`(\\d+(?:[._]\\d+)?)\\s*${INCH_MARK}?\\s*[x×]\\s*(\\d+(?:[._]\\d+)?)`, "i"),
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
