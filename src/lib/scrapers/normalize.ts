import type { PageCatalog, CatalogGroup, CatalogSwatch } from "./catalog";
import { extractListedFormats, type ListedFormat } from "./listed-sizes";
import {
  groundTechSpecs,
  parseTechSpecs,
  parseTechSpecsDetailed,
  standardNear,
} from "./spec-parse";
import { splitSpecialPieces } from "./special-pieces";
import { extractSwatchCards, isNonColorName } from "./catalog";
import {
  canonicalFinish,
  dropNominalTwins,
  parseSizeLabel,
  sizeChartLabel,
  type ParsedSize,
} from "./size-format";
import type { ScrapedColor, ScrapedProduct, ScrapedSize } from "./types";
import { upgradeImageUrl } from "../image-url";
import { isJunkImage } from "../image-sniff";
import { nominalAspectRatio } from "../swatch-geometry";

export interface FinalizeContext {
  catalog?: PageCatalog | null;
  pageTitle?: string;
  sourceText?: string;
  /** Original page HTML. Sizes and specs are taken from this, not from the model, when it is present. */
  pageHtml?: string;
}

const FINISH_ORDER = [
  "semi-gloss",
  "glossy",
  "deep glaze",
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

  const pageHtml = ctx.pageHtml || (ctx.sourceText?.includes("<") ? ctx.sourceText : "");
  if (pageHtml) {
    const listed = extractListedFormats(pageHtml);
    const split = splitSpecialPieces(pageHtml, listed);
    applyListedFormats(next, split.formats, Boolean(catalog && catalog.groups.length > 0));
    const onChart = new Set(next.sizes.map((size) => sizeChartLabel(size).toLowerCase()));
    next.specialPieces = split.specials.filter((label) => !onChart.has(label.toLowerCase()));
    applySharedAvailability(next, pageHtml);
  }
  collapseFinishVariants(next);
  applyGroundedSpecs(next, pageHtml, sourceText);
  if (pageHtml) attachSwatchCards(next, pageHtml);

  applyThicknessNotes(next, sourceText);
  clearUnratedDcof(next, sourceText);
  applyWallFootnote(next, sourceText);
  applyPrintedFinish(next, sourceText);
  if (pageHtml) applyPrintedFootnotes(next, pageHtml);
  dropNonColorLabels(next);
  stripColorNoise(next);
  dropOrphanDecoSwatches(next);
  dedupeFootnotes(next);
  next.heroImageUrl = cleanImageUrl(next.heroImageUrl);
  if (catalog?.heroImageUrl && (!next.heroImageUrl || isJunkImage(next.heroImageUrl) || looksLikeSwatch(next.heroImageUrl))) {
    next.heroImageUrl = catalog.heroImageUrl;
  }
  next.colors = next.colors.map((c) => ({
    ...c,
    name: c.name.trim(),
    imageUrl: cleanImageUrl(c.imageUrl),
    decoImageUrl: c.decoImageUrl ? cleanImageUrl(c.decoImageUrl) : undefined,
    faces: c.faces?.map((face) => ({ ...face, imageUrl: cleanImageUrl(face.imageUrl) })),
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
        color = { name: swatch.name, imageUrl: "", faces: [] };
        byKey.set(key, color);
        order.push(key);
      }
      const parsed = parseSizeLabel(swatch.sizeRaw);
      addFace(color, {
        imageUrl: swatch.imageUrl,
        finish: swatch.finish,
        sizeLabel: parsed && parsed.widthIn > 0 ? parsed.label : swatch.sizeRaw || null,
        widthIn: parsed && parsed.widthIn > 0 ? parsed.widthIn : null,
        heightIn: parsed && parsed.heightIn > 0 ? parsed.heightIn : null,
        photoWidth: swatch.photoWidth ?? null,
        photoHeight: swatch.photoHeight ?? null,
        isDeco: group.isDeco || swatch.isDeco || Boolean(parsed?.isDeco),
      });
    }
  }
  for (const color of byKey.values()) {
    sortFaces(color);
    syncPrimaryImages(color);
  }
  return order
    .map((k) => byKey.get(k)!)
    .filter((c) => c.imageUrl || c.decoImageUrl || (c.faces && c.faces.length > 0));
}

function addFace(color: ScrapedColor, face: NonNullable<ScrapedColor["faces"]>[number]): void {
  if (!face.imageUrl) return;
  const faces = color.faces ?? [];
  const path = face.imageUrl.split("?")[0];
  if (faces.some((existing) => existing.imageUrl.split("?")[0] === path)) return;
  color.faces = [...faces, stampFaceRatio(face)];
}

function stampFaceRatio(face: NonNullable<ScrapedColor["faces"]>[number]) {
  const aspectRatio = nominalAspectRatio(face.widthIn, face.heightIn);
  return {
    ...face,
    aspectRatio,
    sizeUnknown: aspectRatio == null,
  };
}

function sortFaces(color: ScrapedColor): void {
  if (!color.faces || color.faces.length < 2) return;
  const rank = (face: NonNullable<ScrapedColor["faces"]>[number]) => {
    if (face.isDeco || face.finish === "deep glaze") return 0;
    if (face.widthIn && face.heightIn && face.heightIn / face.widthIn < 1.2) return 1;
    return 2;
  };
  color.faces = [...color.faces].sort((a, b) => rank(a) - rank(b));
}

function syncPrimaryImages(color: ScrapedColor): void {
  const faces = color.faces ?? [];
  const field = faces.find((face) => !face.isDeco) ?? faces[0];
  const deco = faces.find((face) => face.isDeco);
  if (field && !color.imageUrl) color.imageUrl = field.imageUrl;
  if (deco && !color.decoImageUrl) color.decoImageUrl = deco.imageUrl;
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

const WALL_ONLY_NOTE = /^\s*\*?\s*ceramic wall tile\s*[—–-]\s*not for floors\s*\.?\s*$/i;

/** The canned wall-only line is kept only when the product itself is wall-only. */
function sourceIsWallOnly(text: string): boolean {
  const norm = text.replace(/\s+/g, " ");
  const floorAndWall =
    /floor\s*(?:&|and|\/|\+)\s*wall/i.test(norm) ||
    /wall\s*(?:&|and|\/|\+)\s*floor/i.test(norm);
  // A porcelain line badged for both floors and walls is not wall-only,
  // even when the site nav also contains those words next to "ceramic wall".
  const bothApplications =
    /\bfloor\b/i.test(norm) &&
    /\bwall\b/i.test(norm) &&
    /porcelain|stoneware/i.test(norm) &&
    !/ceramic wall/i.test(norm);
  if (floorAndWall || bothApplications) return false;
  return (
    /ceramic wall tile/i.test(norm) ||
    /\bceramic wall\b/i.test(norm) ||
    /not (?:recommended |suitable )?for floors/i.test(norm) ||
    /\b(?:walls?|backsplash) only\b/i.test(norm)
  );
}

function applyWallFootnote(product: ScrapedProduct, sourceText: string): void {
  const wallOnly = sourceIsWallOnly(sourceText);
  product.footnotes = product.footnotes.filter((note) => !WALL_ONLY_NOTE.test(note) || wallOnly);
  if (!wallOnly) return;
  if (product.footnotes.some((note) => WALL_ONLY_NOTE.test(note))) return;
  product.footnotes.push("*ceramic wall tile — not for floors");
}

/** A Finish row ("Finish Semi-Gloss") beats a glossy word in the marketing copy. */
function applyPrintedFinish(product: ScrapedProduct, sourceText: string): void {
  const printed = printedFinishes(sourceText);
  if (printed.length === 0) return;
  product.finishLegend = sortFinishes(printed);
}

function printedFinishes(text: string): string[] {
  const found: string[] = [];
  const label = /\bfinish\b\s*[:=]?\s*/gi;
  let match: RegExpExecArray | null;
  const token = /^(?:semi[-\s]?gloss|glossy|gloss|matte|matt|polished|silk|textured|natural|grip|honed|bright)\b/i;
  while ((match = label.exec(text))) {
    let rest = text.slice(match.index + match[0].length, match.index + match[0].length + 80);
    let guard = 0;
    while (guard < 6) {
      guard += 1;
      rest = rest.replace(/^\s+/, "");
      const hit = rest.match(token);
      if (!hit) break;
      const canon = canonicalFinish(hit[0]);
      if (canon && !found.includes(canon)) found.push(canon);
      rest = rest.slice(hit[0].length);
    }
    if (found.length > 0) break;
  }
  return found;
}

function attachSwatchCards(product: ScrapedProduct, html: string): void {
  if (!product.factoryUrl) return;
  const cards = extractSwatchCards(html, product.factoryUrl);
  const fields = cards.filter((card) => !card.isStructure && isColorCaption(card.name));
  const structures = cards.filter((card) => card.isStructure);
  if (fields.length < 4 && structures.length < 2) return;

  for (const field of fields) {
    const key = field.name.toLowerCase();
    let color = product.colors.find((item) => namesMatch(item.name, field.name));
    if (!color) {
      const mentioned = structures.some((card) => namesMatch(field.name, card.name));
      if (!mentioned && fields.length < 4) continue;
      color = { name: field.name, imageUrl: field.imageUrl };
      product.colors.push(color);
      const fieldLabels = product.sizes.filter((size) => !size.isDeco).map((size) => sizeChartLabel(size));
      if (fieldLabels.length > 0) product.availability[key] = fieldLabels;
    } else if (!color.imageUrl) {
      color.imageUrl = field.imageUrl;
    }
  }

  for (const structure of structures) {
    const color = product.colors.find((item) => namesMatch(item.name, structure.name));
    if (!color || color.decoImageUrl) continue;
    color.decoImageUrl = structure.imageUrl;
  }

  const decoSizes = product.sizes.filter((size) => size.isDeco);
  if (decoSizes.length !== 1) return;
  const chart = sizeChartLabel(decoSizes[0]);
  for (const color of product.colors) {
    if (!color.decoImageUrl) continue;
    const key = color.name.toLowerCase();
    const list = product.availability[key] ?? [];
    if (!list.some((entry) => sizeChartLabel({ label: entry }) === chart || entry === chart)) {
      product.availability[key] = [...list, chart];
    }
  }
}

function isColorCaption(name: string): boolean {
  if (isNonColorName(name)) return false;
  if (parseSizeLabel(name)) return false;
  if (/^(glossy|matte|polished|natural|soft|finish|sizes?)$/i.test(name.trim())) return false;
  if (/^\d/.test(name.trim())) return false;
  return name.trim().split(/\s+/).length <= 4;
}

function dropNonColorLabels(product: ScrapedProduct): void {
  const dropped = new Set<string>();
  product.colors = product.colors.filter((color) => {
    if (!isNonColorName(color.name)) return true;
    dropped.add(color.name.toLowerCase());
    return false;
  });
  for (const key of Object.keys(product.availability)) {
    if (dropped.has(key.toLowerCase()) || isNonColorName(key)) delete product.availability[key];
  }
  if (!product.availabilityFinishes) return;
  for (const key of Object.keys(product.availabilityFinishes)) {
    if (dropped.has(key.toLowerCase()) || isNonColorName(key)) delete product.availabilityFinishes[key];
  }
}

function applyPrintedFootnotes(product: ScrapedProduct, html: string): void {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");
  const printed: string[] = [];
  const re = /\*\s*([A-Za-z][\s\S]{10,180}?TCNA\b[\s\S]{0,60}?\.)/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    const sentence = `*${match[1].replace(/\s+/g, " ").trim()}`;
    if (!printed.some((note) => note.toLowerCase() === sentence.toLowerCase())) printed.push(sentence);
  }
  if (printed.length === 0) return;
  const kept = product.footnotes.filter((note) => !printed.some((full) => notesOverlap(note, full)));
  product.footnotes = [...printed, ...kept];
}

function notesOverlap(shorter: string, longer: string): boolean {
  const a = noteKey(shorter);
  const b = noteKey(longer);
  if (!a || !b) return false;
  if (a === b || b.startsWith(a) || a.startsWith(b)) return true;
  // A long installation note that already contains the TCNA sentence
  // is the same footnote, not a second one.
  if (a.length >= 24 && b.includes(a)) return true;
  if (b.length >= 24 && a.includes(b)) return true;
  return false;
}

function noteKey(note: string): string {
  return note.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function dedupeFootnotes(product: ScrapedProduct): void {
  const kept: string[] = [];
  for (const note of product.footnotes) {
    const text = note.trim();
    if (!text) continue;
    if (kept.some((existing) => notesOverlap(text, existing))) continue;
    for (let i = kept.length - 1; i >= 0; i -= 1) {
      if (notesOverlap(kept[i], text) && noteKey(text).length > noteKey(kept[i]).length) {
        kept.splice(i, 1);
      }
    }
    if (!kept.some((existing) => notesOverlap(text, existing))) kept.push(text);
  }
  product.footnotes = kept;
}

function stripColorNoise(product: ScrapedProduct): void {
  const collection = (product.factoryName || "").trim();
  const rename = (name: string): string => {
    let next = name.replace(/\s+/g, " ").trim();
    next = next.replace(/\s+bg$/i, "").trim();
    if (collection.length >= 4) {
      const escaped = collection.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const stripped = next.replace(new RegExp(`^${escaped}\\s+`, "i"), "").trim();
      if (stripped.length >= 2) next = stripped;
    }
    return next || name.trim();
  };
  const seen = new Set<string>();
  const colors: ScrapedColor[] = [];
  for (const color of product.colors) {
    const name = rename(color.name);
    const key = name.toLowerCase();
    if (seen.has(key)) {
      const existing = colors.find((item) => item.name.toLowerCase() === key);
      if (existing) {
        for (const face of color.faces ?? []) addFace(existing, face);
        if (color.imageUrl) addFace(existing, { imageUrl: color.imageUrl, isDeco: false });
        syncPrimaryImages(existing);
      }
      continue;
    }
    seen.add(key);
    colors.push({ ...color, name });
  }
  product.colors = colors;

  const rewrite = (record: Record<string, string[]> | undefined) => {
    if (!record) return record;
    const next: Record<string, string[]> = {};
    for (const [key, value] of Object.entries(record)) {
      const name = rename(key).toLowerCase();
      next[name] = next[name] ? [...next[name], ...value] : value;
    }
    return next;
  };
  product.availability = rewrite(product.availability) ?? {};
  if (product.availabilityFinishes) {
    const next: Record<string, Record<string, string[]>> = {};
    for (const [key, value] of Object.entries(product.availabilityFinishes)) {
      next[rename(key).toLowerCase()] = value;
    }
    product.availabilityFinishes = next;
  }
}

function dropOrphanDecoSwatches(product: ScrapedProduct): void {
  const hasDecoSize = product.sizes.some(
    (size) => Boolean(size.isDeco) || /\bdeco\b/i.test(size.label),
  );
  if (hasDecoSize) return;
  for (const color of product.colors) {
    if (color.decoImageUrl) delete color.decoImageUrl;
  }
}

function namesMatch(colorName: string, caption: string): boolean {
  const color = colorName.toLowerCase().trim();
  const cap = caption.toLowerCase().trim();
  if (!color || !cap) return false;
  const escaped = color.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (new RegExp(`\\b${escaped}\\b`, "i").test(cap)) return true;
  const last = cap.split(/\s+/).pop() ?? "";
  if (last.length < 4) return false;
  const lastEscaped = last.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${lastEscaped}\\b`, "i").test(color);
}

function applyListedFormats(
  product: ScrapedProduct,
  listed: ListedFormat[],
  fromCatalog: boolean,
): void {
  const parsedRows = listed
    .map((format) => {
      const parsed = parseSizeLabel(format.raw);
      if (!parsed) return null;
      if (parsed.widthIn <= 0 && parsed.label !== "trapezoid mosaic") return null;
      return { format, parsed };
    })
    .filter((row): row is { format: ListedFormat; parsed: ParsedSize } => row != null);
  const survivors = new Set(dropNominalTwins(parsedRows.map((row) => row.parsed)));
  const rows = parsedRows
    .filter((row) => survivors.has(row.parsed))
    .map((row) => {
      const size: ScrapedSize = {
        label: row.parsed.label,
        iconKind: row.parsed.iconKind,
        isDeco: row.parsed.isDeco || undefined,
        sheetLabel: row.parsed.piece === "mosaic" ? row.format.sheetRaw : undefined,
        finishes: row.parsed.finish ? [row.parsed.finish] : undefined,
      };
      return size;
    });
  if (rows.length === 0) return;

  if (!fromCatalog) {
    const allowed = new Set(rows.map(sizeKey));
    product.sizes = product.sizes.filter((size) => allowed.has(sizeKey(size)));
  }

  for (const row of rows) {
    const existing = product.sizes.find((size) => sizeKey(size) === sizeKey(row));
    if (!existing) {
      product.sizes.push(row);
      const chart = sizeChartLabel(row);
      const colorNames = new Set<string>([
        ...product.colors.map((color) => color.name.toLowerCase()),
        ...Object.keys(product.availability).map((name) => name.toLowerCase()),
      ]);
      for (const name of colorNames) {
        const list = product.availability[name] ?? [];
        if (!list.some((entry) => sizeChartLabel({ label: entry }) === chart || entry === chart)) {
          product.availability[name] = [...list, chart];
        }
      }
      continue;
    }
    if (!existing.sheetLabel && row.sheetLabel) existing.sheetLabel = row.sheetLabel;
    if (existing.iconKind === "rectangle" && row.iconKind !== "rectangle") {
      existing.iconKind = row.iconKind;
    }
  }
}

function sizeKey(size: { label: string; isDeco?: boolean | null }): string {
  const parsed = parseSizeLabel(`${size.label}${size.isDeco ? " deco" : ""}`);
  const label = parsed?.label ?? size.label.toLowerCase();
  const deco = Boolean(size.isDeco) || Boolean(parsed?.isDeco);
  return `${label}|${deco ? "d" : "f"}`;
}

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

function splitFinish(name: string): { stem: string; finish: string | null } {
  const trimmed = name.trim();
  for (const suffix of FINISH_SUFFIXES) {
    const re = new RegExp(`(?:\\s+|[-–—])${suffix.replace(/\s+/g, "\\s+")}$`, "i");
    if (!re.test(trimmed)) continue;
    const stem = trimmed.replace(re, "").trim();
    const finish = canonicalFinish(suffix);
    if (stem.length >= 2 && finish) return { stem, finish };
  }
  return { stem: trimmed, finish: null };
}

function sizeLabelFromUrl(url: string): string | null {
  const file = (url || "").split("?")[0];
  const match = file.match(/(\d{1,2}(?:_\d)?)[x×](\d{1,3})(?!\d)/i);
  if (!match) return null;
  const a = Number(match[1].replace("_", "."));
  const b = Number(match[2].replace("_", "."));
  if (!Number.isFinite(a) || !Number.isFinite(b) || Math.max(a, b) > 150) return null;
  const parsed = parseSizeLabel(`${match[1].replace("_", ".")}x${match[2].replace("_", ".")}`);
  return parsed && parsed.widthIn > 0 ? parsed.label : null;
}

function collapseFinishVariants(product: ScrapedProduct): void {
  const parts = product.colors.map((color) => ({ color, ...splitFinish(color.name) }));
  const groups = new Map<string, typeof parts>();
  for (const part of parts) {
    const key = part.stem.toLowerCase();
    const list = groups.get(key) ?? [];
    list.push(part);
    groups.set(key, list);
  }
  const collapsing = [...groups.values()].filter((items) => {
    const finishes = new Set(items.map((item) => item.finish).filter(Boolean));
    return finishes.size >= 2;
  });
  if (collapsing.length === 0) return;

  const globalFinishSizes = new Map<string, Set<string>>();
  for (const part of parts) {
    if (!part.finish) continue;
    const label = sizeLabelFromUrl(part.color.imageUrl);
    if (!label) continue;
    const set = globalFinishSizes.get(part.finish) ?? new Set();
    set.add(label);
    globalFinishSizes.set(part.finish, set);
  }

  const colors: ScrapedColor[] = [];
  const availability: Record<string, string[]> = { ...product.availability };
  const availabilityFinishes: Record<string, Record<string, string[]>> = {
    ...(product.availabilityFinishes ?? {}),
  };
  const legend = new Set<string>();

  for (const items of groups.values()) {
    const finishes = [...new Set(items.map((item) => item.finish).filter((f): f is string => !!f))];
    if (finishes.length < 2) {
      colors.push(...items.map((item) => item.color));
      continue;
    }
    const stem = items[0].stem;
    const swatch =
      items.find((item) => sizeLabelFromUrl(item.color.imageUrl)) ??
      items.find((item) => item.color.imageUrl) ??
      items[0];
    const merged: ScrapedColor = {
      name: stem,
      imageUrl: swatch.color.imageUrl,
      decoImageUrl: items.map((item) => item.color.decoImageUrl).find(Boolean),
      faces: [],
    };
    for (const item of items) {
      for (const face of item.color.faces ?? []) addFace(merged, { ...face, finish: face.finish ?? item.finish });
      if (item.color.imageUrl) {
        const fromUrl = sizeLabelFromUrl(item.color.imageUrl);
        const parsed = fromUrl ? parseSizeLabel(fromUrl) : null;
        addFace(merged, {
          imageUrl: item.color.imageUrl,
          finish: item.finish,
          sizeLabel: fromUrl,
          widthIn: parsed?.widthIn ?? null,
          heightIn: parsed?.heightIn ?? null,
          isDeco: false,
        });
      }
      if (item.color.decoImageUrl) {
        addFace(merged, {
          imageUrl: item.color.decoImageUrl,
          finish: item.finish,
          isDeco: true,
        });
      }
    }
    syncPrimaryImages(merged);
    colors.push(merged);
    for (const finish of finishes) legend.add(finish);
    for (const item of items) {
      delete availability[item.color.name];
      delete availability[item.color.name.toLowerCase()];
    }

    const finishSizes = globalFinishSizes;
    const mapped = [...finishSizes.values()].some((set) => set.size > 0);
    const labels: string[] = [];
    const perSize: Record<string, string[]> = {};
    for (const size of product.sizes) {
      const chart = sizeChartLabel(size);
      const offering = finishes.filter((finish) => {
        const set = finishSizes.get(finish);
        if (!mapped || !set || set.size === 0) return true;
        return set.has(size.label) || set.has(chart);
      });
      if (offering.length === 0) continue;
      labels.push(chart);
      if (!sameSet(offering, finishes)) perSize[chart] = sortFinishes(offering);
    }
    availability[stem.toLowerCase()] = labels;
    if (Object.keys(perSize).length > 0) availabilityFinishes[stem.toLowerCase()] = perSize;
  }

  product.colors = colors;
  product.availability = availability;
  product.availabilityFinishes =
    Object.keys(availabilityFinishes).length > 0 ? availabilityFinishes : undefined;
  if (legend.size > 0) product.finishLegend = sortFinishes([...legend]);
}

function applyGroundedSpecs(product: ScrapedProduct, pageHtml: string, sourceText: string): void {
  const detailed = pageHtml ? parseTechSpecsDetailed(pageHtml) : { specs: parseTechSpecs(sourceText), standards: {} };
  const grounded = groundTechSpecs(product.techSpecs, `${pageHtml}\n${sourceText}`);
  product.techSpecs = { ...grounded, ...stripEmpty(detailed.specs) };
  product.specStandards = { ...(product.specStandards ?? {}), ...detailed.standards };
  const blob = `${pageHtml}\n${sourceText}`;
  for (const key of Object.keys(product.techSpecs) as (keyof ScrapedProduct["techSpecs"])[]) {
    if (!product.specStandards[key]) {
      const near = standardNear(key, blob);
      if (near) product.specStandards[key] = near;
    }
  }
  const source = product.factoryUrl || "";
  product.specSources = { ...(product.specSources ?? {}) };
  if (source) {
    for (const key of Object.keys(product.techSpecs) as (keyof ScrapedProduct["techSpecs"])[]) {
      if (!product.specSources[key]) product.specSources[key] = source;
    }
  }
}

function applySharedAvailability(product: ScrapedProduct, html: string): void {
  const colors = product.colors.map((color) => color.name).filter(Boolean);
  if (colors.length < 2) return;
  const flat = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ");
  const re =
    /(\d+(?:[.,]\d+)?\s*["”″]?\s*[x×]\s*\d+(?:[.,]\d+)?\s*["”″]?)\s*(?:stretch\s+)?(mosaic|bullnose|covebase)\s*\((\d+)\)/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(flat))) {
    if (Number(match[3]) !== colors.length) continue;
    const parsed = parseSizeLabel(`${match[1]} ${match[2]}`);
    if (!parsed) continue;
    const chart = sizeChartLabel({ label: parsed.label, isDeco: parsed.isDeco });
    for (const color of colors) {
      const key = color.toLowerCase();
      const list = product.availability[key] ?? [];
      if (!list.some((entry) => sizeChartLabel({ label: entry }) === chart || entry === chart)) {
        product.availability[key] = [...list, chart];
      }
    }
  }
}

function stripEmpty(specs: Partial<ScrapedProduct["techSpecs"]>): Partial<ScrapedProduct["techSpecs"]> {
  const out: Partial<ScrapedProduct["techSpecs"]> = {};
  for (const [key, value] of Object.entries(specs)) {
    if (value != null && String(value).trim() !== "") {
      (out as Record<string, string>)[key] = value;
    }
  }
  return out;
}

export function cleanImageUrl(url: string): string {
  return upgradeImageUrl(url);
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
