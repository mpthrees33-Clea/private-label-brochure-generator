import type { BrochureData } from "./brochure-types";
import { canonicalFinish } from "./scrapers/size-format";

// The size chart has to use the finish the factory actually printed.
// A saved product can still say "matte" because that used to be the
// fallback when the spec line was "glossy finish" or "FinishSemi-Gloss".
// Image filenames and the description are enough to correct that
// without another scrape. A legend the rep set to something other
// than the single default is left alone.

const FILE_FINISHES: Array<[string, RegExp]> = [
  ["semi-gloss", /semi[-_\s]?gloss/i],
  ["deep glaze", /deep[-_\s]?glaze/i],
  ["glossy", /glossy|\bgloss\b/i],
  ["matte", /matte|\bmatt\b/i],
  ["polished", /polished|lappato/i],
  ["textured", /textured/i],
];

export function reconcileFinishLegend(data: BrochureData): string[] {
  const legend = (data.finishLegend ?? []).map((item) => item.toLowerCase());
  if (!isDefaultMatte(legend)) return legend;

  const fromFiles = unanimousFileFinish(imageUrls(data));
  if (fromFiles) return [fromFiles];

  const fromCopy = finishNamedInCopy(`${data.description ?? ""} ${data.trinityTagline ?? ""}`);
  if (fromCopy && fromCopy !== "matte") return [fromCopy];
  return legend.length > 0 ? legend : ["matte"];
}

export function isDefaultMatte(legend: string[]): boolean {
  return legend.length === 0 || (legend.length === 1 && legend[0] === "matte");
}

function imageUrls(data: BrochureData): string[] {
  const urls: string[] = [];
  for (const color of data.colors) {
    if (color.imageUrl) urls.push(color.imageUrl);
    if (color.decoImageUrl) urls.push(color.decoImageUrl);
    for (const face of color.faces ?? []) {
      if (face.imageUrl) urls.push(face.imageUrl);
    }
  }
  return urls;
}

function unanimousFileFinish(urls: string[]): string | null {
  const found = new Set<string>();
  let named = 0;
  for (const url of urls) {
    const finish = finishInFilename(url);
    if (!finish) continue;
    named += 1;
    found.add(finish);
  }
  if (named === 0 || found.size !== 1) return null;
  return [...found][0];
}

function finishInFilename(url: string): string | null {
  const file = url.split("?")[0].split("/").pop() ?? "";
  for (const [name, pattern] of FILE_FINISHES) {
    if (pattern.test(file)) return canonicalFinish(name) ?? name;
  }
  return null;
}

function finishNamedInCopy(text: string): string | null {
  if (/semi[-\s]?gloss/i.test(text)) return "semi-gloss";
  const named = text.match(/\b(glossy|gloss|matte|matt|polished|silk|textured)\s+finish\b/i);
  if (!named) return null;
  return canonicalFinish(named[1]);
}
