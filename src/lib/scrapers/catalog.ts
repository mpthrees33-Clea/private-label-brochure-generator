import * as cheerio from "cheerio";
import type { AnyNode, Element } from "domhandler";
import { pickHeroImage, type HeroCandidate } from "../hero-image";
import { isJunkImage } from "../image-sniff";
import {
  bestImageUrl,
  filenameHasTileSize,
  isPlaceholderImageUrl,
  upgradeImageUrl,
  urlsFromSrcset,
} from "../image-url";
import { canonicalFinish, parseSizeLabel, type ParsedSize } from "./size-format";

// A factory page's size chart is usually structured even when the
// marketing copy is not: Florida Tile groups swatches under
// `h3.shape-name` ("Wall Tile (Glossy) - 4x16") and lists bullnose in
// a trim table. Parsing that ourselves is what keeps wall-tile sizes,
// per-color finishes, and field/deco photos stable when the model
// flattens every finish into its own column.

export interface CatalogSwatch {
  name: string;
  imageUrl: string;
  finish: string | null;
  isDeco: boolean;
  sizeRaw: string;
  photoWidth?: number;
  photoHeight?: number;
}

export interface CatalogGroup {
  sizeRaw: string;
  finish: string | null;
  isDeco: boolean;
  pieceHint: string;
  swatches: CatalogSwatch[];
}

export interface PageCatalog {
  collectionName: string | null;
  heroImageUrl: string | null;
  groups: CatalogGroup[];
  swatches: CatalogSwatch[];
  /** Visible text, used for thickness notes and the "wall only" footnote. */
  text: string;
}

const SIZE_IN_HEADING =
  /^(.*?)\s*(?:\(([^)]+)\))?\s*[-–—]\s*(\d+(?:\.\d+)?\s*[x×]\s*\d+(?:\.\d+)?(?:\s*(?:cm|mm))?)\s*$/i;

export function extractCatalog(html: string, pageUrl: string): PageCatalog {
  const $ = cheerio.load(html);
  const collectionName = collectionNameFrom($);
  const heroImageUrl = heroFrom($, pageUrl);
  const groups: CatalogGroup[] = [];

  const headingNodes = $("h2, h3, h4").toArray().filter((el) => {
    const text = $(el).text().replace(/\s+/g, " ").trim();
    return SIZE_IN_HEADING.test(text);
  });

  for (const el of headingNodes) {
    const text = $(el).text().replace(/\s+/g, " ").trim();
    const match = text.match(SIZE_IN_HEADING);
    if (!match) continue;
    const pieceHint = match[1] ?? "";
    const paren = match[2] ?? "";
    const sizeRaw = match[3] ?? "";
    const isDeco = /\bdeco(?:rative|r)?\b/i.test(`${pieceHint} ${paren}`);
    const finish = canonicalFinish(paren) ?? canonicalFinish(pieceHint);
    const swatches = swatchesUntilNextHeading($, el, pageUrl, {
      sizeRaw: `${pieceHint} ${paren} ${sizeRaw}`,
      finish,
      isDeco,
      shapeName: pieceHint.trim(),
    });
    groups.push({
      sizeRaw: `${pieceHint} (${paren}) - ${sizeRaw}`.replace(/\(\)\s*/, ""),
      finish,
      isDeco,
      pieceHint: `${pieceHint} ${paren}`,
      swatches,
    });
  }

  const trimGroups = trimTableGroups($, pageUrl);
  groups.push(...trimGroups);
  groups.push(...labeledGroups($, pageUrl, groups, shopifySkuSizes($)));

  const scoped = scopeGroups(groups, pageUrl);
  const swatches = scoped.flatMap((g) => g.swatches);

  const text = $("body").text().replace(/\s+/g, " ").trim();
  return { collectionName, heroImageUrl, groups: scoped, swatches, text };
}

function collectionNameFrom($: cheerio.CheerioAPI): string | null {
  const h1 = $("h1").first().text().replace(/\s+/g, " ").trim();
  if (h1 && h1.split(/\s+/).length <= 4 && !/[.!?]/.test(h1)) return h1;
  const title = ($("title").first().text() || "").replace(/\s+/g, " ").trim();
  if (!title) return null;
  const head = title.split("|")[0]?.trim() ?? "";
  const left = head.split(/\s[-–—:]\s/)[0]?.trim() ?? "";
  if (!left || left.split(/\s+/).length > 4) return null;
  if (/^(home|products|collections)$/i.test(left)) return null;
  return left;
}

function heroFrom($: cheerio.CheerioAPI, pageUrl: string): string | null {
  const candidates: HeroCandidate[] = [];
  const og = $('meta[property="og:image"], meta[name="og:image"]').attr("content") || "";
  const ogAbs = og ? absUrl(og, pageUrl) : null;
  if (ogAbs) {
    const width = Number($('meta[property="og:image:width"]').attr("content"));
    const height = Number($('meta[property="og:image:height"]').attr("content"));
    candidates.push({
      url: ogAbs,
      alt: "",
      width: Number.isFinite(width) ? width : undefined,
      height: Number.isFinite(height) ? height : undefined,
    });
  }
  $("[style*='background']").each((_, el) => {
    if ($(el).closest("nav, header, footer").length) return;
    const style = $(el).attr("style") || "";
    const lead = isLeadFrame($, el);
    for (const match of style.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/gi)) {
      const abs = absUrl(match[1] || "", pageUrl);
      if (!abs) continue;
      candidates.push({ url: abs, alt: "", lead });
    }
  });
  $("img").each((_, img) => {
    if ($(img).closest("nav, header, footer").length) return;
    const src = bestSrc($, img);
    const abs = src ? absUrl(src, pageUrl) : null;
    if (!abs) return;
    const width = Number($(img).attr("width"));
    const height = Number($(img).attr("height"));
    candidates.push({
      url: abs,
      alt: $(img).attr("alt") || "",
      width: Number.isFinite(width) && width > 0 ? width : undefined,
      height: Number.isFinite(height) && height > 0 ? height : undefined,
      linkHref: $(img).closest("a").attr("href") || "",
      lead: isLeadFrame($, img),
    });
  });
  return pickHeroImage(candidates, collectionNameFrom($));
}

function isLeadFrame($: cheerio.CheerioAPI, el: Element): boolean {
  const node = $(el);
  const blob = `${node.attr("class") || ""} ${node.parent().attr("class") || ""}`;
  if (/swiper|banner|hero|slider/i.test(blob)) return true;
  return node.closest("[class*='banner'], [class*='swiper'], [class*='hero'], [class*='slider']").length > 0;
}

function swatchesUntilNextHeading(
  $: cheerio.CheerioAPI,
  heading: Element,
  pageUrl: string,
  ctx: { sizeRaw: string; finish: string | null; isDeco: boolean; shapeName: string },
): CatalogSwatch[] {
  const out: CatalogSwatch[] = [];
  const seen = new Set<string>();
  // Walk following siblings of the heading and of its parent row, but
  // stop at the next size heading. Bootstrap-vue pages put the h3 and
  // the cards in the same column, so a sibling walk is enough.
  const root = heading.parent ?? heading;
  let started = false;
  const elements = $(root).find("h2, h3, h4, img").toArray();
  for (const el of elements) {
    if (el === heading) {
      started = true;
      continue;
    }
    if (!started) continue;
    if (el.tagName === "h2" || el.tagName === "h3" || el.tagName === "h4") {
      const text = $(el).text().replace(/\s+/g, " ").trim();
      if (SIZE_IN_HEADING.test(text)) break;
      continue;
    }
    if (el.tagName !== "img") continue;
    const swatch = swatchFromImg($, el, pageUrl, ctx);
    if (!swatch) continue;
    const key = `${swatch.name}|${swatch.imageUrl}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(swatch);
  }
  // The sibling walk above misses images when the heading's parent
  // doesn't contain the cards (heading and cards are cousins). Fall
  // back to nextAll on the heading itself.
  if (out.length === 0) {
    let sib = $(heading).next();
    while (sib.length) {
      const text = sib.text().replace(/\s+/g, " ").trim();
      if (SIZE_IN_HEADING.test(text) && sib.is("h2, h3, h4")) break;
      sib.find("img").addBack("img").each((_, el) => {
        const swatch = swatchFromImg($, el, pageUrl, ctx);
        if (!swatch) return;
        const key = `${swatch.name}|${swatch.imageUrl}`;
        if (seen.has(key)) return;
        seen.add(key);
        out.push(swatch);
      });
      if (sib.find("h2, h3, h4").toArray().some((el) => SIZE_IN_HEADING.test($(el).text().replace(/\s+/g, " ").trim()))) {
        break;
      }
      sib = sib.next();
    }
  }
  return dedupeByColor(out);
}

function swatchFromImg(
  $: cheerio.CheerioAPI,
  el: AnyNode,
  pageUrl: string,
  ctx: { sizeRaw: string; finish: string | null; isDeco: boolean; shapeName: string },
): CatalogSwatch | null {
  if (el.type !== "tag") return null;
  const alt = $(el).attr("alt") || "";
  const src = bestSrc($, el);
  const abs = src ? absUrl(src, pageUrl) : null;
  if (!abs || isJunkImage(abs, alt)) return null;
  if (/trim image/i.test(alt)) return null;
  const name = colorNameFromAlt(alt, ctx.shapeName);
  if (!name) return null;
  return {
    name,
    imageUrl: preferLarger(abs),
    finish: ctx.finish,
    isDeco: ctx.isDeco,
    sizeRaw: ctx.sizeRaw,
  };
}

function bestSrc($: cheerio.CheerioAPI, el: Element): string | null {
  const $img = $(el);
  const urls = [
    $img.attr("src"),
    $img.attr("data-src"),
    $img.attr("data-lazy-src"),
    $img.attr("data-original"),
    ...urlsFromSrcset($img.attr("srcset")),
    ...urlsFromSrcset($img.attr("data-srcset")),
    ...urlsFromSrcset($img.attr("data-lazy-srcset")),
  ];
  // A card often has a hidden `_larger` image and a visible `_public` thumb.
  const twins = $img
    .parent()
    .find("img")
    .toArray()
    .map((img) => $(img).attr("src") || "")
    .filter(Boolean);
  const best = bestImageUrl([...urls, ...twins]);
  return best || null;
}

function preferLarger(url: string): string {
  return upgradeImageUrl(url);
}

export function colorNameFromAlt(alt: string, shapeName = ""): string | null {
  let s = alt.replace(/\s+/g, " ").trim();
  if (!s || /trim image|^logo\b/i.test(s)) return null;
  s = s.replace(/\d+(?:\.\d+)?\s*[x×]\s*\d+(?:\.\d+)?(?:\s*cm)?/gi, " ");
  s = s.replace(/\([^)]*\)/g, " ");
  if (shapeName.trim()) {
    const escaped = shapeName.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    s = s.replace(new RegExp(escaped, "ig"), " ");
  }
  s = s.replace(
    /\b(floor\/wall tile|wall tile|floor tile|ceramic tile|porcelain tile|glazed ceramic|field tile|mosaics?|tile)\b/gi,
    " ",
  );
  s = s.replace(/\bdeco(?:rative|r)?\b/gi, " ");
  s = s.replace(
    /\b(glossy|gloss|matte|silk|polished|textured|natural|3d plus|3d)\b/gi,
    " ",
  );
  s = s.replace(/\s+/g, " ").trim();
  if (!s || s.length < 2 || isNonColorName(s)) return null;
  return s;
}

/** Section headings, body/material labels, and packing captions are not colors. */
export function isNonColorName(name: string): boolean {
  const s = name.replace(/\s+/g, " ").trim();
  if (!s) return true;
  if (/^available\s+(?:finishes?|edges?|sizes?|colou?rs?|formats?)\b/i.test(s)) return true;
  if (/^(?:finishes?|edges?|sizes?|formats?|specifications?|technical details)$/i.test(s)) return true;
  if (
    /\b(?:brochure|sell\s*sheet|sales\s*sheet|fact\s*sheet|thumbnail|msds|environment\s+image|sale\s+price|download|data\s*sheet|spec\s*sheet)\b/i.test(
      s,
    )
  ) {
    return true;
  }
  if (
    /^(?:glazed\s+|unglazed\s+|full[\s-]?body\s+|through[\s-]?body\s+)*(?:porcelain|ceramic|stoneware)(?:\s+(?:porcelain|ceramic|stoneware|tile))*$/i.test(
      s,
    )
  ) {
    return true;
  }
  if (/\b(?:packing|packaging)\s+(?:table|chart|list)\b/i.test(s)) return true;
  return false;
}

function trimTableGroups($: cheerio.CheerioAPI, pageUrl: string): CatalogGroup[] {
  const groups: CatalogGroup[] = [];
  $("table").each((_, table) => {
    const headers = $(table)
      .find("thead th")
      .toArray()
      .map((th) => $(th).text().replace(/\s+/g, " ").trim().toLowerCase());
    const typeIdx = headers.findIndex((h) => h === "type");
    const sizeIdx = headers.findIndex((h) => h === "size");
    if (typeIdx < 0 || sizeIdx < 0) return;
    $(table)
      .find("tbody tr")
      .each((__, tr) => {
        const cells = $(tr).find("td").toArray();
        const type = $(cells[typeIdx]).text().replace(/\s+/g, " ").trim();
        const size = $(cells[sizeIdx]).text().replace(/\s+/g, " ").trim();
        if (!type || !size || !/\d/.test(size)) return;
        const rowText = $(tr).text().replace(/\s+/g, " ");
        const finish =
          canonicalFinish(rowText) ??
          (/\b3d plus\b/i.test(rowText) ? "3d plus" : /\b3d\b/i.test(rowText) ? "3d" : null);
        const img = $(tr).find("img").attr("src");
        const imageUrl = img ? absUrl(img, pageUrl) : null;
        groups.push({
          sizeRaw: `${type} ${size}`,
          finish,
          isDeco: false,
          pieceHint: type,
          swatches: imageUrl && !isJunkImage(imageUrl)
            ? [
                {
                  name: type,
                  imageUrl: preferLarger(imageUrl),
                  finish,
                  isDeco: false,
                  sizeRaw: `${type} ${size}`,
                },
              ]
            : [],
        });
      });
  });
  return groups;
}

function scopeGroups(groups: CatalogGroup[], pageUrl: string): CatalogGroup[] {
  if (groups.length === 0) return groups;
  const tokens = slugTokens(pageUrl);
  if (tokens.length === 0) return groups;
  const matching = groups.filter((g) =>
    g.swatches.some((s) => tokens.some((t) => s.imageUrl.toLowerCase().includes(t))),
  );
  // Keep trim rows even when their generic trim render has no collection
  // token — they were parsed from a table on this page. Drop them only
  // when EVERY swatch we kept is from another collection and the trim
  // image also doesn't match. If nothing matched, the page isn't using
  // collection-named files; trust the headings.
  if (matching.length === 0) return groups;
  // Trim renders are often generic (`s4369_3x6_ceramic_wall`) and do not
  // contain the collection slug. Keep them once the field groups matched.
  const trims = groups.filter(
    (g) => /\bbullnose\b|\bpencil\b/i.test(g.pieceHint) && !matching.includes(g),
  );
  return [...matching, ...trims];
}

function slugTokens(pageUrl: string): string[] {
  try {
    const parts = new URL(pageUrl).pathname.split("/").filter(Boolean);
    const last = (parts[parts.length - 1] ?? "").toLowerCase().replace(/-series$/, "");
    return last
      .split("-")
      .filter((t) => t.length >= 5 && t !== "floor" && t !== "wall" && t !== "tile");
  } catch {
    return [];
  }
}

function dedupeByColor(swatches: CatalogSwatch[]): CatalogSwatch[] {
  const byName = new Map<string, CatalogSwatch>();
  for (const s of swatches) {
    const key = s.name.toLowerCase();
    const prev = byName.get(key);
    if (!prev || scoreUrl(s.imageUrl) > scoreUrl(prev.imageUrl)) byName.set(key, s);
  }
  return [...byName.values()];
}

function scoreUrl(url: string): number {
  if (/_larger\./i.test(url)) return 3;
  if (/_public\./i.test(url)) return 1;
  return 2;
}

function absUrl(raw: string, pageUrl: string): string | null {
  try {
    const abs = new URL(raw, pageUrl);
    if (abs.protocol !== "http:" && abs.protocol !== "https:") return null;
    return abs.toString();
  } catch {
    return null;
  }
}

export interface SwatchCard {
  name: string;
  imageUrl: string;
  isStructure: boolean;
}

/** Short caption + image cards, including "3D Maki Corda" structure shots. */
export function extractSwatchCards(html: string, pageUrl: string): SwatchCard[] {
  const $ = cheerio.load(html);
  const token = swatchToken(pageUrl);
  const out: SwatchCard[] = [];
  const seen = new Set<string>();
  $("img").each((_, img) => {
    const src = $(img).attr("src") || $(img).attr("data-src") || "";
    const abs = src ? absUrl(src, pageUrl) : null;
    if (!abs || isJunkImage(abs)) return;
    if (token && !abs.toLowerCase().includes(token)) return;
    const caption = captionNear($, img);
    if (!caption) return;
    const key = `${caption.toLowerCase()}|${abs}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({
      name: caption,
      imageUrl: preferLarger(abs),
      isStructure: /\b3d\b|\bdeco(?:rative|r)?\b|\bstruttura\b/i.test(caption),
    });
  });
  return out;
}

function captionNear($: cheerio.CheerioAPI, img: Element): string | null {
  let card = $(img).parent();
  for (let depth = 0; depth < 3 && card.length; depth += 1) {
    if (card.is("body, html")) return null;
    const text = card.text().replace(/\s+/g, " ").trim();
    if (text.length > 80) return null;
    const captions = card
      .find("p, h3, h4, h5, figcaption")
      .toArray()
      .map((el) => $(el).text().replace(/\s+/g, " ").trim())
      .filter((value) => value.length >= 2 && value.length <= 48 && value.split(/\s+/).length <= 6);
    const unique = [...new Set(captions)];
    if (unique.length === 1) return unique[0];
    card = card.parent();
  }
  return null;
}

function swatchToken(pageUrl: string): string {
  try {
    const parts = new URL(pageUrl).pathname.split("/").filter(Boolean);
    const last = (parts[parts.length - 1] ?? "").toLowerCase().replace(/-series$/, "");
    const token = last.split("-").find((part) => part.length >= 4 && !/^(product|products|collection|collections|tile|tiles)$/.test(part));
    return token ?? "";
  } catch {
    return "";
  }
}

const DROP_SLUG_WORDS = new Set([
  "large",
  "small",
  "mosaic",
  "mosaics",
  "tile",
  "tiles",
  "product",
  "products",
  "image",
  "img",
  "scaled",
  "swatch",
  "field",
  "deco",
  "decorative",
  "trapezoid",
  "trapesoid",
  "bg",
]);

const FINISH_SUFFIXES = [
  "deep glaze",
  "3d plus",
  "semi-gloss",
  "semi gloss",
  "glossy",
  "gloss",
  "matte",
  "matt",
  "polished",
  "textured",
  "natural",
  "silk",
  "grip",
  "honed",
];

function labeledGroups(
  $: cheerio.CheerioAPI,
  pageUrl: string,
  existing: CatalogGroup[],
  skuSizes: Map<string, string>,
): CatalogGroup[] {
  const known = new Set(
    existing.flatMap((group) => group.swatches.map((swatch) => imagePath(swatch.imageUrl))),
  );
  const collection = (collectionNameFrom($) || "").toLowerCase();
  const swatches = extractLabeledSwatches($, pageUrl, collection, skuSizes).filter(
    (swatch) => !known.has(imagePath(swatch.imageUrl)),
  );
  return swatches.map((swatch) => ({
    sizeRaw: swatch.sizeRaw,
    finish: swatch.finish,
    isDeco: swatch.isDeco,
    pieceHint: swatch.isDeco ? "deco" : swatch.sizeRaw || "field",
    swatches: [swatch],
  }));
}

function extractLabeledSwatches(
  $: cheerio.CheerioAPI,
  pageUrl: string,
  collection: string,
  skuSizes: Map<string, string>,
): CatalogSwatch[] {
  const found: Array<CatalogSwatch & { fromSlug: boolean }> = [];
  $("img").each((_, img) => {
    if ($(img).closest("nav, header, footer").length) return;
    const src = bestSrc($, img);
    const abs = src ? absUrl(src, pageUrl) : null;
    if (!abs || isJunkImage(abs) || isPlaceholderImageUrl(abs) || /\.svg($|\?)/i.test(abs)) return;
    if (/ambient|amb3d|lifestyle|room[_-]?scene|environment/i.test(abs)) return;
    const alt = $(img).attr("alt") || "";
    const link = $(img).closest("a").attr("href") || "";
    const labeled = labelForImage($, img, alt, link, abs, collection);
    if (!labeled) return;
    const split = stemAndFinish(labeled.name);
    const name = split.stem.trim();
    if (!name || name.length < 2 || isNonColorName(name)) return;
    if (collection && name.toLowerCase() === collection) return;
    const sizeRaw = labeled.sizeRaw || sizeTokenIn(abs) || skuSizes.get(imagePath(abs)) || "";
    const photo = photoPixels($, img, abs);
    found.push({
      name,
      imageUrl: preferLarger(abs),
      finish: split.finish,
      isDeco: /\bdeco(?:rative|r)?\b/i.test(`${labeled.raw} ${sizeRaw}`),
      sizeRaw,
      photoWidth: photo.width,
      photoHeight: photo.height,
      fromSlug: labeled.fromSlug,
    });
  });

  // The same file is often a labeled card and a filename-only duplicate.
  // Keep the card caption. Cap faces so a gallery heading cannot flood a color.
  const byPath = new Map<string, CatalogSwatch & { fromSlug: boolean }>();
  for (const swatch of found) {
    const path = imagePath(swatch.imageUrl);
    const prev = byPath.get(path);
    if (!prev || (prev.fromSlug && !swatch.fromSlug)) byPath.set(path, swatch);
  }
  const perName = new Map<string, number>();
  const out: CatalogSwatch[] = [];
  for (const swatch of byPath.values()) {
    const key = swatch.name.toLowerCase();
    const count = perName.get(key) ?? 0;
    if (count >= 4) continue;
    perName.set(key, count + 1);
    const { fromSlug: _fromSlug, ...rest } = swatch;
    out.push(rest);
  }
  return out;
}

function labelForImage(
  $: cheerio.CheerioAPI,
  img: Element,
  alt: string,
  link: string,
  imageUrl: string,
  collection: string,
): { name: string; raw: string; sizeRaw: string; fromSlug: boolean } | null {
  let node = $(img);
  for (let depth = 0; depth < 5; depth += 1) {
    node = node.parent();
    if (!node.length || node.is("body, html")) break;
    if (node.find("img").length > 3) continue;
    const text = node.text().replace(/\s+/g, " ").trim();
    if (text.length > 400) continue;
    const headings = node
      .find("h2, h3, h4, h5, figcaption, .sr-only")
      .toArray()
      .map((el) => $(el).text().replace(/\s+/g, " ").trim())
      .filter((value) => value.length >= 2 && value.length <= 60 && value.split(/\s+/).length <= 8);
    const unique = [...new Set(headings)].filter(
      (value) => value.toLowerCase() !== collection && !isNonColorName(value),
    );
    if (unique.length === 0) continue;
    const sizes = sizeTokensIn(text);
    return { name: unique[0], raw: unique[0], sizeRaw: sizes[0] ?? "", fromSlug: false };
  }

  const fromAlt = colorNameFromAlt(alt);
  if (fromAlt && fromAlt.toLowerCase() !== collection && !isNonColorName(fromAlt)) {
    return { name: alt, raw: alt, sizeRaw: sizeTokenIn(imageUrl), fromSlug: false };
  }

  const fromLink = nameFromSlug(link);
  if (fromLink && fromLink.name.toLowerCase() !== collection) return { ...fromLink, fromSlug: true };
  const fromFile = nameFromSlug(imageUrl);
  if (
    fromFile &&
    fromFile.name.toLowerCase() !== collection &&
    (filenameHasTileSize(imageUrl) || /mosaic|trapezoid|trapesoid/i.test(imageUrl))
  ) {
    return { ...fromFile, fromSlug: true };
  }
  return null;
}

function nameFromSlug(raw: string): { name: string; raw: string; sizeRaw: string; fromSlug: boolean } | null {
  if (!raw) return null;
  let path = raw;
  try {
    path = new URL(raw, "https://placeholder.local").pathname;
  } catch {
    path = raw.split("?")[0] ?? raw;
  }
  const base = path.split("/").filter(Boolean).pop() ?? "";
  const stem = base.replace(/\.(png|jpe?g|webp|gif)$/i, "");
  const parts = stem.split(/[-_\s]+/).filter(Boolean);
  const size = parts.find((part) => /^\d+(?:_\d+)?x\d+(?:_\d+)?$/i.test(part)) ?? "";
  const words = parts.filter((part) => {
    if (/^\d+(?:_\d+)?x\d+/i.test(part)) return false;
    if (/^\d+$/.test(part)) return false;
    if (/[0-9]/.test(part) && /[a-f]/i.test(part)) return false;
    if (DROP_SLUG_WORDS.has(part.toLowerCase())) return false;
    return part.length >= 2 && /^[a-z]+$/i.test(part);
  });
  if (words.length === 0 || words.length > 4) return null;
  const tileSized = size ? filenameHasTileSize(`x/${size}.jpg`) || Boolean(parseSizeLabel(size.replace(/_/g, "."))) : false;
  const piece = /mosaic|trapezoid|trapesoid|deco/i.test(stem);
  if (!tileSized && !piece) return null;
  if (tileSized && parseSizeLabel(size.replace(/_/g, ".")) == null) return null;
  return {
    name: words.join(" "),
    raw: stem,
    sizeRaw: size.replace(/_(\d)\b/, ".$1"),
    fromSlug: true,
  };
}

function stemAndFinish(name: string): { stem: string; finish: string | null } {
  const trimmed = name.replace(/\s+/g, " ").trim();
  for (const suffix of FINISH_SUFFIXES) {
    const re = new RegExp(`(?:\\s+|[-–—])${suffix.replace(/\s+/g, "\\s+")}$`, "i");
    if (!re.test(trimmed)) continue;
    const stem = trimmed.replace(re, "").trim();
    const finish = canonicalFinish(suffix);
    if (stem.length >= 2 && finish) return { stem, finish };
  }
  return { stem: trimmed, finish: canonicalFinish(trimmed) };
}

/** 7_5x40 is 7.5×40. A following _uuid must not become 40.67. */
const TILE_SIZE_TOKEN = /(\d{1,2}(?:[._]\d)?)[x×](\d{1,3})(?!\d)/gi;

function sizeTokensIn(text: string): string[] {
  const out: string[] = [];
  for (const match of text.matchAll(TILE_SIZE_TOKEN)) {
    const normalized = `${match[1].replace("_", ".")}x${match[2]}`;
    const parsed = parseSizeLabel(normalized);
    if (!parsed || parsed.widthIn <= 0 || Math.max(parsed.widthIn, parsed.heightIn) > 48) continue;
    if (!out.includes(normalized)) out.push(normalized);
  }
  return out;
}

function sizeTokenIn(url: string): string {
  const base = (url || "").split("?")[0]?.split("/").pop() ?? "";
  return sizeTokensIn(base)[0] ?? "";
}

function photoPixels(
  $: cheerio.CheerioAPI,
  img: Element,
  url: string,
): { width?: number; height?: number } {
  const width = Number($(img).attr("width"));
  const height = Number($(img).attr("height"));
  if (width >= 80 && height >= 80) return { width, height };
  const match = url.match(/(\d{3,5})[x×](\d{3,5})/);
  if (!match) return {};
  const a = Number(match[1]);
  const b = Number(match[2]);
  if (Math.max(a, b) >= 300 && Math.min(a, b) >= 80) return { width: a, height: b };
  return {};
}

/** Shopify variant SKUs name the format (AURA-SLATE-3x16-MATT) when the file is only a pixel crop. */
function shopifySkuSizes($: cheerio.CheerioAPI): Map<string, string> {
  const html = $.html();
  const skuByVariant = new Map<string, string>();
  for (const match of html.matchAll(/"sku":\s*"([^"]+)"[\s\S]{0,500}?variant=(\d+)/g)) {
    skuByVariant.set(match[2], match[1]);
  }
  const out = new Map<string, string>();
  for (const match of html.matchAll(/"src":\s*"([^"]+)"[\s\S]{0,400}?"variant_ids":\s*\[(\d+)/g)) {
    const sku = skuByVariant.get(match[2]);
    const size = sku ? sizeTokensIn(sku)[0] : "";
    if (!size) continue;
    const raw = match[1].replace(/\\\//g, "/");
    const path = imagePath(raw.startsWith("//") ? `https:${raw}` : raw);
    if (path && !out.has(path)) out.set(path, size);
  }
  return out;
}

function imagePath(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url.split("?")[0] ?? url;
  }
}

export function catalogSummary(catalog: PageCatalog): string {
  if (catalog.groups.length === 0 && !catalog.collectionName) return "";
  const lines: string[] = ["Structured catalog parsed from the page (trust this over prose):"];
  if (catalog.collectionName) lines.push(`Collection: ${catalog.collectionName}`);
  if (catalog.heroImageUrl) lines.push(`Hero image: ${catalog.heroImageUrl}`);
  for (const g of catalog.groups) {
    const names = g.swatches.map((s) => s.name).join(", ");
    lines.push(
      `- ${g.pieceHint} ${g.sizeRaw} | finish=${g.finish ?? "unspecified"} | deco=${g.isDeco ? "yes" : "no"} | colors: ${names || "(none)"}`,
    );
  }
  return lines.join("\n");
}

export type { ParsedSize };
