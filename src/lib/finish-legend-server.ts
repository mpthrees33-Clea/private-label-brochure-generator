import type { BrochureData } from "./brochure-types";
import { extractCatalog } from "./scrapers/catalog";
import { printedFinishes } from "./scrapers/normalize";
import { isDefaultMatte, reconcileFinishLegend } from "./finish-legend";

const cached = new Map<string, string[] | null>();

type WithFactory = BrochureData & { factoryUrl?: string | null };

/** Replace a default matte legend with the finish printed on the factory page. */
export async function withScrapedFinish<T extends WithFactory>(data: T): Promise<T> {
  const local = reconcileFinishLegend(data);
  const next = local.join("|") === (data.finishLegend ?? []).join("|") ? data : { ...data, finishLegend: local };
  if (!isDefaultMatte(next.finishLegend) || !next.factoryUrl) return next;

  const printed = await printedFinishFor(next.factoryUrl);
  if (!printed || printed.length === 0 || isDefaultMatte(printed)) return next;
  return { ...next, finishLegend: printed };
}

async function printedFinishFor(url: string): Promise<string[] | null> {
  if (cached.has(url)) return cached.get(url) ?? null;
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: { "user-agent": "Mozilla/5.0" },
    });
    if (!response.ok) {
      cached.set(url, null);
      return null;
    }
    const html = await response.text();
    const catalog = extractCatalog(html, url);
    const printed = printedFinishes(`${catalog.text}\n${html.replace(/<[^>]+>/g, " ")}`);
    cached.set(url, printed);
    return printed;
  } catch {
    cached.set(url, null);
    return null;
  }
}
