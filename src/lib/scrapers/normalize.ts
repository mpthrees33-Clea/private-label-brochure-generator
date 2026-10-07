import type { PageCatalog, CatalogGroup, CatalogSwatch } from "./catalog";
import {
  canonicalFinish,
  parseSizeLabel,
  sizeChartLabel,
} from "./size-format";
import type { ScrapedColor, ScrapedProduct, ScrapedSize } from "./types";
import { isJunkImage, largerTwinUrl } from "../image-sniff";

export interface FinalizeContext {
  catalog?: PageCatalog | null;
  pageTitle?: string;
  sourceText?: string;
}

const FINISH_ORDER = [
  "glossy",
  "silk",
  "matte",
  "polished",
  "textured",
  "3d",
  "3d plus",
  "grip",
];

export function finalizeScrapedProduct(
  product: ScrapedProduct,
  ctx: FinalizeContext = {},
): ScrapedProduct {
  const catalog = ctx.catalog ?? null;
  const sourceText = `${ctx.pageTitle ?? ""}\n${ctx.sourceText ?? ""}\n${catalog?.text ?? ""}`;
  const next: ScrapedProduct = {
    ...product,
    colors: product.colors.map((c) => ({ ...c })),
    sizes: product.sizes.map((s) => ({ ...s })),
    availability: { ...product.availability },
    techSpecs: { ...product.techSpecs },
    finishLegend: [...(product.finishLegend ?? [])],
    footnotes: [...(product.footnotes ?? [])],
  };

  applyCollectionName(next, catalog, ctx.pageTitle);
  applyTrinityNameGuard(next, sourceText);

  if (catalog && catalog.groups.length > 0) {
    applyCatalog(next, catalog);
  } else {
    applyParsedSizes(next);
    next.colors = pairDecoColors(next.colors);
    repairImagesFromSwatches(next, catalog?.swatches ?? []);
  }

  applyThicknessNotes(next, sourceText);
  clearUnratedDcof(next, sourceText);
  applyWallFootnote(next, sourceText);
  next.heroImageUrl = cleanImageUrl(next.heroImageUrl);
  if (catalog?.heroImageUrl && (!next.heroImageUrl || isJunkImage(next.heroImageUrl) || looksLikeSwatch(next.heroImageUrl))) {
    next.heroImageUrl = catalog.heroImageUrl;
  }
  next.colors = next.colors.map((c) => ({
    ...c,
    name: c.name.trim(),
    imageUrl: cleanImageUrl(c.imageUrl),
    decoImageUrl: c.decoImageUrl ? cleanImageUrl(c.decoImageUrl) : undefined,
  }));
  return next;
}

function applyCollectionName(
  product: ScrapedProduct,
  catalog: PageCatalog | null,
  pageTitle: string | undefined,
): void {
  const official = (catalog?.collectionName || titleCollection(pageTitle) || "").trim();
  if (!official) return;
  const current = (product.factoryName || "").trim();
  if (!current || !sameCollection(current, official)) {
    product.factoryName = official;
  }
}

function titleCollection(title: string | undefined): string | null {
  if (!title) return null;
  const head = title.replace(/\s+/g, " ").trim().split("|")[0]?.trim() ?? "";
  const left = head.split(/\s[-–—:]\s/)[0]?.trim() ?? "";
  if (!left || left.split(/\s+/).length > 4) return null;
  return left;
}

function sameCollection(a: string, b: string): boolean {
  const na = a.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const nb = b.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

function applyTrinityNameGuard(product: ScrapedProduct, sourceText: string): void {
  const name = (product.suggestedTrinityName || "").toLowerCase().replace(/[^a-z]/g, "");
  if (!name) {
    product.suggestedTrinityName = "";
    return;
  }
  const factory = (product.factoryName || "").toLowerCase().replace(/[^a-z]/g, "");
  if (factory && (name === factory || factory.includes(name) || name.includes(factory))) {
    product.suggestedTrinityName = "";
    return;
  }
  if (name.length >= 4 && new RegExp(`\\b${name}\\b`, "i").test(sourceText)) {
    // The private-label name has to be new. "matera" showed up as the
    // Trinity name for Eclipta because the story mentions Matera stone.
    product.suggestedTrinityName = "";
  }
}

interface BuiltSize {
  size: ScrapedSize;
  /** color lower → finishes seen for this size */
  byColor: Map<string, Set<string>>;
  /** Trim tables name a profile, not a color. Offer it on every color. */
  allColors: boolean;
}

function applyCatalog(product: ScrapedProduct, catalog: PageCatalog): void {
  const built = new Map<string, BuiltSize>();
  const order: string[] = [];

  for (const group of catalog.groups) {
    const parsed = parseSizeLabel(`${group.pieceHint} ${group.sizeRaw}`);
    if (!parsed) continue;
    if (group.isDeco) parsed.isDeco = true;
    if (group.finish && !parsed.finish) parsed.finish = group.finish;
    const key = `${parsed.label}|${parsed.isDeco ? "deco" : "field"}`;
    let row = built.get(key);
    if (!row) {
      row = {
        size: {
          label: parsed.label,
          iconKind: parsed.iconKind,
          isDeco: parsed.isDeco || undefined,
          finishes: [],
        },
        byColor: new Map(),
        allColors: false,
      };
      built.set(key, row);
      order.push(key);
    }
    const finish = group.finish ?? parsed.finish;
    if (finish && !(row.size.finishes ?? []).includes(finish)) {
      row.size.finishes = [...(row.size.finishes ?? []), finish];
    }
    // Trim tables don't name colors — the finish still belongs on the size.
    const named = group.swatches.filter((s) => !isTrimSwatchName(s, group));
    if (named.length === 0 && /\bbullnose\b|\bpencil\b/i.test(group.pieceHint)) {
      row.allColors = true;
    }
    for (const swatch of named) {
      const colorKey = swatch.name.toLowerCase();
      const set = row.byColor.get(colorKey) ?? new Set<string>();
      if (swatch.finish) set.add(swatch.finish);
      else if (finish) set.add(finish);
      row.byColor.set(colorKey, set);
    }
  }

  const colors = colorsFromCatalog(catalog);
  const parsedLegend = legendFromSizes([...built.values()].map((b) => b.size));
  const legend = parsedLegend.length > 0 ? parsedLegend : ["matte"];
  for (const row of built.values()) {
    if (row.allColors) {
      const trimFinishes = new Set(row.size.finishes ?? []);
      for (const color of colors) {
        const key = color.name.toLowerCase();
        if (!row.byColor.has(key)) row.byColor.set(key, new Set(trimFinishes));
      }
    }
    const finishes = row.size.finishes ?? [];
    if (finishes.length === 0 || sameSet(finishes, legend)) {
      row.size.finishes = undefined;
    }
  }

  const availability: Record<string, string[]> = {};
  const availabilityFinishes: Record<string, Record<string, string[]>> = {};
  for (const color of colors) {
    const key = color.name.toLowerCase();
    const labels: string[] = [];
    const perSize: Record<string, string[]> = {};
    for (const id of order) {
      const row = built.get(id)!;
      if (!row.byColor.has(key)) continue;
      const chart = sizeChartLabel(row.size);
      labels.push(chart);
      const finishes = [...(row.byColor.get(key) ?? [])];
      const sizeFinishes = row.size.finishes ?? legend;
      if (finishes.length > 0 && !sameSet(finishes, sizeFinishes)) {
        perSize[chart] = sortFinishes(finishes);
      }
    }
    availability[key] = labels;
    if (Object.keys(perSize).length > 0) availabilityFinishes[key] = perSize;
  }

  product.sizes = order.map((id) => built.get(id)!.size);
  if (colors.length > 0) product.colors = colors;
  product.availability = availability;
  product.availabilityFinishes =
    Object.keys(availabilityFinishes).length > 0 ? availabilityFinishes : undefined;
  product.finishLegend = legend;

  if (catalog.heroImageUrl) product.heroImageUrl = catalog.heroImageUrl;
  repairImagesFromSwatches(product, catalog.swatches);
}

function isTrimSwatchName(swatch: CatalogSwatch, group: CatalogGroup): boolean {
  return (
    /\bbullnose\b|\bpencil\b/i.test(group.pieceHint) &&
    swatch.name.toLowerCase() === group.pieceHint.toLowerCase()
  );
}

function colorsFromCatalog(catalog: PageCatalog): ScrapedColor[] {
  const order: string[] = [];
  const byKey = new Map<string, ScrapedColor>();
  for (const group of catalog.groups) {
    if (/\bbullnose\b|\bpencil\b/i.test(group.pieceHint)) continue;
    for (const swatch of group.swatches) {
      const key = swatch.name.toLowerCase();
      let color = byKey.get(key);
      if (!color) {
        color = { name: swatch.name, imageUrl: "" };
        byKey.set(key, color);
        order.push(key);
      }
      if (group.isDeco || swatch.isDeco) {
        if (!color.decoImageUrl) color.decoImageUrl = swatch.imageUrl;
      } else if (!color.imageUrl) {
        color.imageUrl = swatch.imageUrl;
      }
    }
  }
  return order.map((k) => byKey.get(k)!).filter((c) => c.imageUrl || c.decoImageUrl);
}

function applyParsedSizes(product: ScrapedProduct): void {
  const originalAvail = product.availability;
  const built = new Map<string, BuiltSize>();
  const order: string[] = [];
  for (const size of product.sizes) {
    const parsed = parseSizeLabel(
      `${size.label}${size.isDeco ? " deco" : ""} ${(size.finishes ?? []).join(" ")}`,
    );
    if (!parsed) {
      const key = `raw|${size.label}|${size.isDeco ? "d" : "f"}`;
      if (!built.has(key)) {
        built.set(key, {
          size: { ...size, finishes: size.finishes ? [...size.finishes] : undefined },
          byColor: new Map(),
          allColors: false,
        });
        order.push(key);
      }
      continue;
    }
    if (size.isDeco) parsed.isDeco = true;
    const key = `${parsed.label}|${parsed.isDeco ? "deco" : "field"}`;
    let row = built.get(key);
    if (!row) {
        row = {
          size: {
            label: parsed.label,
            iconKind: parsed.iconKind,
            isDeco: parsed.isDeco || undefined,
            thickness: size.thickness,
            finishes: [],
          },
          byColor: new Map(),
          allColors: false,
        };
      built.set(key, row);
      order.push(key);
    } else if (!row.size.thickness && size.thickness) {
      row.size.thickness = size.thickness;
    }
    const finish = parsed.finish ?? null;
    const extra = (size.finishes ?? []).map((f) => canonicalFinish(f)).filter((f): f is string => !!f);
    for (const f of finish ? [finish, ...extra] : extra) {
      if (!(row.size.finishes ?? []).includes(f)) {
        row.size.finishes = [...(row.size.finishes ?? []), f];
      }
    }
  }

  // Rebuild which colors offer which collapsed size, and which finish
  // that cell actually had (glossy column vs matte column).
  for (const [color, labels] of Object.entries(originalAvail)) {
    for (const label of labels) {
      const parsed = parseSizeLabel(label);
      if (!parsed) continue;
      const key = `${parsed.label}|${parsed.isDeco ? "deco" : "field"}`;
      const row = built.get(key);
      if (!row) continue;
      const set = row.byColor.get(color.toLowerCase()) ?? new Set<string>();
      if (parsed.finish) set.add(parsed.finish);
      row.byColor.set(color.toLowerCase(), set);
    }
  }

  const legend = legendFromSizes([...built.values()].map((b) => b.size));
  if (legend.length > 0) product.finishLegend = legend;
  else if (!product.finishLegend || product.finishLegend.length === 0) {
    product.finishLegend = ["matte"];
  }
  for (const row of built.values()) {
    const finishes = row.size.finishes ?? [];
    if (finishes.length === 0 || sameSet(finishes, product.finishLegend)) {
      row.size.finishes = undefined;
    }
  }
  product.sizes = order.map((id) => built.get(id)!.size);

  const availability: Record<string, string[]> = {};
  const availabilityFinishes: Record<string, Record<string, string[]>> = {};
  const anyColorSpecific = [...built.values()].some((r) => r.byColor.size > 0);
  if (anyColorSpecific) {
    const colorNames = new Set<string>([
      ...product.colors.map((c) => c.name.toLowerCase()),
      ...Object.keys(originalAvail).map((c) => c.toLowerCase()),
    ]);
    for (const color of colorNames) {
      const labels: string[] = [];
      const perSize: Record<string, string[]> = {};
      for (const id of order) {
        const row = built.get(id)!;
        const finishes = row.byColor.get(color);
        if (!finishes) continue;
        const chart = sizeChartLabel(row.size);
        labels.push(chart);
        const sizeFinishes = row.size.finishes ?? product.finishLegend;
        if (finishes.size > 0 && !sameSet([...finishes], sizeFinishes)) {
          perSize[chart] = sortFinishes([...finishes]);
        }
      }
      if (labels.length > 0) availability[color] = labels;
      if (Object.keys(perSize).length > 0) availabilityFinishes[color] = perSize;
    }
    product.availability = availability;
    product.availabilityFinishes =
      Object.keys(availabilityFinishes).length > 0 ? availabilityFinishes : undefined;
  } else {
    product.availability = remapAvailability(originalAvail, product.sizes);
  }
}

function remapAvailability(
  avail: Record<string, string[]>,
  sizes: ScrapedSize[],
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [color, labels] of Object.entries(avail)) {
    const next = new Set<string>();
    for (const label of labels) {
      const parsed = parseSizeLabel(label);
      next.add(parsed ? sizeChartLabel({ label: parsed.label, isDeco: parsed.isDeco }) : label);
    }
    out[color.toLowerCase()] = [...next];
  }
  if (Object.keys(out).length === 0 && sizes.length > 0) {
    // left empty — caller may fill
  }
  return out;
}

export function pairDecoColors(colors: ScrapedColor[]): ScrapedColor[] {
  const decoRe = /\s+deco(?:rative|r)?$/i;
  const fields: ScrapedColor[] = [];
  const decos: ScrapedColor[] = [];
  for (const color of colors) {
    if (decoRe.test(color.name)) decos.push(color);
    else fields.push({ ...color });
  }
  for (const deco of decos) {
    const base = deco.name.replace(decoRe, "").trim().toLowerCase();
    const match = fields.find((f) => f.name.trim().toLowerCase() === base);
    const decoUrl = deco.decoImageUrl || deco.imageUrl;
    if (match) {
      if (!match.decoImageUrl && decoUrl) match.decoImageUrl = decoUrl;
      if (!match.imageUrl && deco.imageUrl && !decoRe.test(deco.name)) {
        match.imageUrl = deco.imageUrl;
      }
    } else {
      fields.push({
        name: deco.name.replace(decoRe, "").trim(),
        imageUrl: "",
        decoImageUrl: decoUrl,
      });
    }
  }
  return fields;
}

function repairImagesFromSwatches(product: ScrapedProduct, swatches: CatalogSwatch[]): void {
  if (swatches.length === 0) return;
  for (const color of product.colors) {
    const related = swatches.filter((s) => s.name.toLowerCase() === color.name.toLowerCase());
    const field = related.find((s) => !s.isDeco);
    const deco = related.find((s) => s.isDeco);
    if (field && (!color.imageUrl || isJunkImage(color.imageUrl) || looksLikeRoom(color.imageUrl))) {
      color.imageUrl = field.imageUrl;
    }
    if (deco && (!color.decoImageUrl || isJunkImage(color.decoImageUrl))) {
      color.decoImageUrl = deco.imageUrl;
    }
  }
}

function looksLikeSwatch(url: string): boolean {
  return /imagestiles|\/tiles\/|swatch|tile-image/i.test(url);
}

function looksLikeRoom(url: string): boolean {
  return /room[_-]?scene|ambient|lifestyle|hero/i.test(url);
}

function legendFromSizes(sizes: ScrapedSize[]): string[] {
  const found = new Set<string>();
  for (const size of sizes) {
    for (const f of size.finishes ?? []) {
      const c = canonicalFinish(f) ?? f.toLowerCase();
      if (c) found.add(c);
    }
  }
  const ordered = FINISH_ORDER.filter((f) => found.has(f));
  for (const f of found) if (!ordered.includes(f)) ordered.push(f);
  return ordered;
}

function sortFinishes(finishes: string[]): string[] {
  return FINISH_ORDER.filter((f) => finishes.includes(f)).concat(
    finishes.filter((f) => !FINISH_ORDER.includes(f)),
  );
}

function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sb = new Set(b);
  return a.every((x) => sb.has(x));
}

const THICKNESS_RE = /(\d+(?:\.\d+)?\s*mm)\s*\(([^)]+)\)/gi;

function applyThicknessNotes(product: ScrapedProduct, sourceText: string): void {
  const notes = [...sourceText.matchAll(THICKNESS_RE)];
  if (notes.length === 0) return;
  for (const size of product.sizes) {
    if (size.thickness) continue;
    const parsed = parseSizeLabel(size.label);
    if (!parsed) continue;
    for (const note of notes) {
      const thickness = note[1].replace(/\s+/g, "");
      const appliesTo = note[2];
      const parts = appliesTo.split(/\s*(?:&|and|,)\s*/i);
      const hit = parts.some((part) => {
        const p = parseSizeLabel(part);
        return p && p.label === parsed.label;
      });
      if (hit) {
        size.thickness = thickness;
        break;
      }
    }
  }
}

function clearUnratedDcof(product: ScrapedProduct, sourceText: string): void {
  const hasNa = /a326\.3[^.]{0,80}n\/a/i.test(sourceText);
  const hasRating = /interior,\s*wet|≥\s*0\.\d+\s*wet|dcof[^.]{0,40}\d/i.test(sourceText);
  if (hasNa && !hasRating) {
    delete product.techSpecs.dcof;
  }
}

function applyWallFootnote(product: ScrapedProduct, sourceText: string): void {
  const wallOnly =
    /ceramic wall tile/i.test(sourceText) &&
    !/floor\s*(&|and|\/)\s*wall/i.test(sourceText) &&
    !/\bfloor tile\b/i.test(sourceText);
  if (!wallOnly) return;
  if (product.footnotes.some((f) => /wall|floor/i.test(f))) return;
  product.footnotes.push("*ceramic wall tile — not for floors");
}

export function cleanImageUrl(url: string): string {
  const trimmed = (url || "").trim();
  if (!trimmed) return "";
  return largerTwinUrl(trimmed) ?? trimmed;
}

export function imageCandidatesForColor(
  catalog: PageCatalog | null,
  colorName: string,
  deco: boolean,
): string[] {
  if (!catalog) return [];
  return catalog.swatches
    .filter((s) => s.name.toLowerCase() === colorName.toLowerCase() && s.isDeco === deco)
    .map((s) => s.imageUrl);
}
