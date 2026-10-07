import { upgradeImageUrl } from "../image-url";
import { isJunkImage, sniffImageMime } from "../image-sniff";
import type { PageCatalog } from "./catalog";
import type { ScrapedProduct } from "./types";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

type Probe = "ok" | "bad" | "unknown";

// Swap dead or thumbnail URLs for a working higher-res sibling. A network
// failure is "unknown" and keeps the URL — only a definitive non-image
// response (404, HTML challenge) triggers a replacement.
export async function improveProductImages(
  product: ScrapedProduct,
  catalog: PageCatalog | null,
): Promise<void> {
  const heroOptions = [
    product.heroImageUrl,
    catalog?.heroImageUrl ?? "",
  ].filter(Boolean);
  product.heroImageUrl = await pickWorking(heroOptions);

  for (const color of product.colors) {
    const fieldOptions = [
      color.imageUrl,
      ...(catalog?.swatches ?? [])
        .filter((s) => s.name.toLowerCase() === color.name.toLowerCase() && !s.isDeco)
        .map((s) => s.imageUrl),
    ];
    color.imageUrl = await pickWorking(fieldOptions);
    const decoOptions = [
      color.decoImageUrl ?? "",
      ...(catalog?.swatches ?? [])
        .filter((s) => s.name.toLowerCase() === color.name.toLowerCase() && s.isDeco)
        .map((s) => s.imageUrl),
    ];
    const deco = await pickWorking(decoOptions);
    color.decoImageUrl = deco || undefined;
  }
}

async function pickWorking(urls: string[]): Promise<string> {
  const expanded: string[] = [];
  for (const url of urls) {
    if (!url || isJunkImage(url)) continue;
    const larger = upgradeImageUrl(url);
    if (larger) expanded.push(larger);
    if (!expanded.includes(url)) expanded.push(url);
  }
  let fallback = expanded[0] ?? "";
  for (const url of expanded) {
    const probe = await probeImage(url);
    if (probe === "ok") return url;
    if (probe === "unknown" && !fallback) fallback = url;
    if (probe === "bad") continue;
    if (probe === "unknown") return url;
  }
  return fallback;
}

async function probeImage(url: string): Promise<Probe> {
  if (!/^https?:\/\//i.test(url)) return "ok";
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "image/*,*/*;q=0.8", Range: "bytes=0-64" },
      redirect: "follow",
      signal: AbortSignal.timeout(8000),
    });
    if (res.status === 404 || res.status === 410 || res.status === 415) return "bad";
    if (!res.ok && res.status !== 206) return "unknown";
    const type = (res.headers.get("content-type") ?? "").toLowerCase();
    if (type.startsWith("image/")) return "ok";
    if (type.startsWith("text/html")) return "bad";
    const buf = new Uint8Array(await res.arrayBuffer());
    if (sniffImageMime(buf)) return "ok";
    if (type.startsWith("text/")) return "bad";
    return "unknown";
  } catch {
    return "unknown";
  }
}
