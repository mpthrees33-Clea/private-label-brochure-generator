import * as cheerio from "cheerio";
import type { AnyNode, Element } from "domhandler";
import { isJunkImage, largerTwinUrl } from "../image-sniff";
import { canonicalFinish, type ParsedSize } from "./size-format";

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
  const metas = $('meta[property="og:image"], meta[name="og:image"]')
    .toArray()
    .map((el) => $(el).attr("content") || "")
    .map((url) => absUrl(url, pageUrl))
    .filter((url): url is string => !!url && !isJunkImage(url));
  const room = metas.find((url) => /room[_-]?scene|ambient|lifestyle|hero|slider/i.test(url));
  return room ?? metas[0] ?? null;
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
  const src = $img.attr("src") || $img.attr("data-src") || $img.attr("data-lazy-src") || "";
  // A card often has a hidden `_larger` image and a visible `_public` thumb.
  const card = $img.parent();
  const twins = card.find("img").toArray().map((img) => $(img).attr("src") || "").filter(Boolean);
  const larger = twins.find((u) => /_larger\./i.test(u));
  return larger || src || null;
}

function preferLarger(url: string): string {
  return largerTwinUrl(url) ?? url;
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
  if (!s || s.length < 2) return null;
  return s;
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
