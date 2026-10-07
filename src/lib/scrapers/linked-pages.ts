import * as cheerio from "cheerio";
import type { FetchedAnchor } from "./fetch";
import { fetchFactoryDocument } from "./fetch";
import { extractListedFormats } from "./listed-sizes";
import { parseTechSpecsFromHtml } from "./spec-parse";
import {
  dropNominalTwins,
  parseSizeLabel,
  sizeChartLabel,
  type ParsedSize,
} from "./size-format";
import type { ScrapedProduct, ScrapedSize, TechSpecs } from "./types";

// Collection pages often omit the number (or the special pieces, or the
// spec that lives on the SKU). Follow a product link, and follow a lazy
// "Decors" tab that the first HTML response leaves empty.

export async function supplementFromLinkedPages(
  product: ScrapedProduct,
  html: string,
  anchors: FetchedAnchor[],
  pageUrl: string,
): Promise<void> {
  for (const url of lazySectionUrls(html, pageUrl).slice(0, 2)) {
    try {
      const doc = await fetchFactoryDocument(url);
      const fragment = new TextDecoder().decode(doc.bytes);
      applyDecorFragment(product, fragment, pageUrl);
      product.techSpecs = fillEmpty(product.techSpecs, parseTechSpecsFromHtml(fragment));
    } catch {
      // The collection page still stands if a tab fails to load.
    }
  }

  const plan = followPlan(html, product);
  if (!plan) return;
  const links = colorProductLinks(anchors, pageUrl);
  const picked = plan === "sizes" ? pickDiverse(links, 2) : links.slice(0, 8);
  for (const link of picked) {
    try {
      const doc = await fetchFactoryDocument(link.url);
      const pageHtml = new TextDecoder().decode(doc.bytes);
      const name = colorNameFromPage(pageHtml, link.text, product);
      applyColorPage(product, name, pageHtml, plan, link.url);
      // The SKU page is the product. Its own spec line wins over a
      // number the collection page borrowed from a comparison chart.
      const specs = parseTechSpecsFromHtml(pageHtml);
      product.techSpecs = { ...product.techSpecs, ...specs };
    } catch {
      // One blocked color page should not fail the collection.
    }
  }
}

export function followPlan(html: string, product: ScrapedProduct): "sizes" | "availability" | null {
  const hasNumeric = product.sizes.some((size) => {
    const parsed = parseSizeLabel(`${size.label}${size.isDeco ? " deco" : ""}`);
    return Boolean(parsed && parsed.widthIn > 0);
  });
  if (!hasNumeric) return "sizes";
  // The note is often a tooltip title, which disappears once tags are stripped.
  const raw = html.replace(/<script[\s\S]*?<\/script>/gi, " ");
  if (/not all (?:the )?sizes|not available for each color|not every color/i.test(raw)) {
    return "availability";
  }
  return null;
}

export function lazySectionUrls(html: string, pageUrl: string): string[] {
  const $ = cheerio.load(html);
  const out: string[] = [];
  const seen = new Set<string>();
  $("[data-url]").each((_, el) => {
    const raw = ($(el).attr("data-url") || "").trim();
    if (!raw.startsWith("{")) return;
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return;
    }
    const blob = Object.values(data)
      .filter((value) => typeof value === "string")
      .join(" ");
    if (!/decor|trim|mosaic|special/i.test(blob)) return;
    try {
      const url = new URL(pageUrl);
      url.searchParams.set("ajax", "true");
      for (const [key, value] of Object.entries(data)) {
        if (typeof value === "string") url.searchParams.set(key, value);
      }
      const next = url.toString();
      if (seen.has(next)) return;
      seen.add(next);
      out.push(next);
    } catch {
      // ignore
    }
  });
  return out;
}

export function colorProductLinks(anchors: FetchedAnchor[], pageUrl: string): FetchedAnchor[] {
  const token = collectionToken(pageUrl);
  const seen = new Set<string>();
  const out: FetchedAnchor[] = [];
  for (const anchor of anchors) {
    if (!isColorProduct(anchor.url, pageUrl, token)) continue;
    if (/download|catalog|brochure|\.pdf/i.test(`${anchor.url} ${anchor.text}`)) continue;
    const key = anchor.url.split("?")[0];
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(anchor);
  }
  return out;
}

export function applyDecorFragment(product: ScrapedProduct, html: string, pageUrl: string): void {
  const $ = cheerio.load(html);
  $("img").each((_, img) => {
    const src = $(img).attr("src") || "";
    let abs = "";
    try {
      abs = new URL(src, pageUrl).toString();
    } catch {
      return;
    }
    if (!/^https?:/i.test(abs)) return;
    let text = "";
    let node = $(img).parent();
    for (let depth = 0; depth < 5 && node.length; depth += 1) {
      const candidate = node.text().replace(/\s+/g, " ").trim();
      if (candidate.length > 12 && candidate.length < 240 && /\d/.test(candidate)) {
        text = candidate;
        break;
      }
      node = node.parent();
    }
    const parsed = text ? parseSizeLabel(text) : null;
    const name = text ? decorName(text) : null;
    if (!parsed || parsed.widthIn <= 0 || !name) return;
    let color = product.colors.find((item) => item.name.toLowerCase() === name.toLowerCase());
    if (!color) {
      color = { name, imageUrl: abs, decoImageUrl: abs };
      product.colors.push(color);
    } else if (!color.decoImageUrl) {
      color.decoImageUrl = abs;
    }
    const size: ScrapedSize = {
      label: parsed.label,
      iconKind: parsed.iconKind,
      isDeco: true,
    };
    if (!product.sizes.some((item) => sizeKey(item) === sizeKey(size))) product.sizes.push(size);
    const key = color.name.toLowerCase();
    const chart = sizeChartLabel(size);
    const list = product.availability[key] ?? [];
    if (!list.includes(chart)) product.availability[key] = [...list, chart];
  });
}

export function applyColorPage(
  product: ScrapedProduct,
  colorName: string,
  html: string,
  plan: "sizes" | "availability",
  pageUrl: string,
): void {
  const listed = extractListedFormats(html)
    .map((format) => ({ format, parsed: parseSizeLabel(format.raw) }))
    .filter(
      (row): row is { format: (typeof row)["format"]; parsed: ParsedSize } =>
        Boolean(row.parsed && row.parsed.widthIn > 0),
    );
  const survivors = new Set(dropNominalTwins(listed.map((row) => row.parsed)));
  const parsed = listed.filter((row) => survivors.has(row.parsed));
  if (parsed.length === 0) return;
  const decoPage = /compass|deco|decor/i.test(`${pageUrl} ${colorName}`);
  if (plan === "sizes") {
    product.sizes = product.sizes.filter((size) => {
      const current = parseSizeLabel(`${size.label}${size.isDeco ? " deco" : ""}`);
      return Boolean(current && current.widthIn > 0);
    });
    for (const { format, parsed: size } of parsed) {
      const row = toSize(size, decoPage || size.isDeco, format.sheetRaw);
      if (!product.sizes.some((item) => sizeKey(item) === sizeKey(row))) product.sizes.push(row);
    }
    return;
  }
  if (parsed.length < 2) return;
  const labels: string[] = [];
  for (const { format, parsed: size } of parsed) {
    const row = toSize(size, size.isDeco, format.sheetRaw);
    if (!product.sizes.some((item) => sizeKey(item) === sizeKey(row))) product.sizes.push(row);
    labels.push(sizeChartLabel(row));
  }
  const color = matchColor(product, colorName);
  if (!color) return;
  product.availability[color.name.toLowerCase()] = [...new Set(labels)];
}

function toSize(parsed: ParsedSize, deco: boolean, sheet?: string): ScrapedSize {
  return {
    label: parsed.label,
    iconKind: parsed.iconKind,
    isDeco: deco || undefined,
    sheetLabel: parsed.piece === "mosaic" && sheet ? sheet : undefined,
  };
}

function decorName(text: string): string | null {
  let name = text.replace(/\d+(?:\.\d+)?\s*["”″']*\s*[x×]\s*\d+(?:\.\d+)?\s*["”″']*/gi, " ");
  name = name.replace(/thickness\s*\d+(?:[.,]\d+)?\s*mm/gi, " ");
  name = name.replace(
    /\b(soft|glossy|matte|polished|natural|porcelain|tiles?|floors?|walls?|and)\b/gi,
    " ",
  );
  name = name.replace(/\s+/g, " ").trim();
  if (name.length < 3 || name.length > 40) return null;
  return name;
}

function colorNameFromPage(html: string, linkText: string, product: ScrapedProduct): string {
  const fromLink = matchColor(product, linkText);
  if (fromLink) return fromLink.name;
  const h1 = cheerio.load(html)("h1").first().text().replace(/\s+/g, " ").trim();
  const after = h1.split("|").pop()?.trim() ?? "";
  const fromH1 = matchColor(product, after);
  if (fromH1) return fromH1.name;
  return linkText.trim() || after;
}

function matchColor(product: ScrapedProduct, hint: string): ScrapedProduct["colors"][number] | null {
  const name = hint.toLowerCase().replace(/\s+/g, " ").trim();
  if (!name) return null;
  return (
    product.colors.find((color) => color.name.toLowerCase() === name) ??
    product.colors.find((color) => name.includes(color.name.toLowerCase())) ??
    null
  );
}

function pickDiverse(links: FetchedAnchor[], count: number): FetchedAnchor[] {
  const deco = links.find((link) => /compass|deco|decor|mosaic/i.test(`${link.url} ${link.text}`));
  const field = links.find((link) => link !== deco);
  const picked = [field, deco].filter((link): link is FetchedAnchor => Boolean(link));
  for (const link of links) {
    if (picked.length >= count) break;
    if (!picked.includes(link)) picked.push(link);
  }
  return picked.slice(0, count);
}

function collectionToken(pageUrl: string): string {
  try {
    const parts = new URL(pageUrl).pathname.split("/").filter(Boolean);
    const skip = new Set([
      "product",
      "products",
      "produto",
      "collections",
      "collection",
      "product-category",
      "category",
      "en",
    ]);
    return (
      [...parts].reverse().find((part) => part.length >= 4 && !skip.has(part.toLowerCase()))?.toLowerCase() ??
      ""
    );
  } catch {
    return "";
  }
}

function isColorProduct(url: string, pageUrl: string, token: string): boolean {
  if (!token) return false;
  try {
    const host = (value: string) => new URL(value).hostname.toLowerCase().replace(/^www\./, "");
    if (host(url) !== host(pageUrl)) return false;
    const path = new URL(url).pathname.toLowerCase();
    const pagePath = new URL(pageUrl).pathname.toLowerCase();
    if (path === pagePath) return false;
    if (!path.includes(token)) return false;
    return /\/products?\//.test(path);
  } catch {
    return false;
  }
}

function sizeKey(size: { label: string; isDeco?: boolean | null }): string {
  const parsed = parseSizeLabel(`${size.label}${size.isDeco ? " deco" : ""}`);
  const label = parsed?.label ?? size.label.toLowerCase();
  const deco = Boolean(size.isDeco) || Boolean(parsed?.isDeco);
  return `${label}|${deco ? "d" : "f"}`;
}

function fillEmpty(base: Partial<TechSpecs>, next: Partial<TechSpecs>): Partial<TechSpecs> {
  const out: Partial<TechSpecs> = { ...base };
  for (const [key, value] of Object.entries(next)) {
    if (value == null || String(value).trim() === "") continue;
    if (!out[key as keyof TechSpecs]) (out as Record<string, string>)[key] = value;
  }
  return out;
}
