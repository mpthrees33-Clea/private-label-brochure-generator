import * as cheerio from "cheerio";
import { bestImageUrl, urlsFromSrcset } from "../image-url";

export interface FetchedAnchor {
  url: string;
  text: string;
}

export interface FetchedPage {
  url: string;
  cleanedHtml: string;
  title: string;
  /** Every anchor on the page (incl. those in nav/footer), absolute URLs only. */
  anchors: FetchedAnchor[];
}

// Clean already-fetched HTML into a Claude-friendly snapshot: chrome
// (nav/footer) removed, scripts/styles stripped, all image and link
// URLs absolute, whitespace compressed. The HTTP fetch is done by the
// caller so it can sniff Content-Type and route PDFs separately —
// trying to clean a PDF as HTML is what caused the 2026-05-19 marlow
// hallucination incident.
export async function fetchAndCleanPage(url: string, html: string): Promise<FetchedPage> {
  const $ = cheerio.load(html);

  // Capture every anchor on the page BEFORE chrome-stripping — spec
  // sheet / downloads links commonly live in the footer.
  const anchors: FetchedAnchor[] = [];
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    try {
      const absolute = new URL(href, url).toString();
      if (!/^https?:/i.test(absolute)) return;
      anchors.push({
        url: absolute,
        text: ($(el).text() || "").replace(/\s+/g, " ").trim().slice(0, 200),
      });
    } catch {
      // skip non-URL hrefs
    }
  });

  // Strip page chrome / non-content
  $(
    "script, style, noscript, iframe, svg, link[rel=stylesheet], meta, " +
      "nav, header, footer, [role=navigation], [role=banner], [role=contentinfo]",
  ).remove();
  $("[hidden], [aria-hidden=true]").remove();

  // og:image often lives in <meta>, which we strip below. Keep it as a
  // lead photo. It is not automatically the hero — a wide room scene
  // where the tile is only the background should lose to a closer shot.
  const ogImage =
    $('meta[property="og:image"]').attr("content") ||
    $('meta[name="og:image"]').attr("content");
  if (ogImage) {
    try {
      const absolute = new URL(ogImage, url).toString();
      $("body").prepend(`<img src="${absolute}" alt="lead image">`);
    } catch {
      // ignore unparseable og:image
    }
  }

  // <picture><source srcset> often holds the real file while <img src>
  // is a 1×1 placeholder. Copy the best candidate onto the img.
  $("picture source[srcset], picture source[data-srcset]").each((_, el) => {
    const $source = $(el);
    const best =
      bestUrlFromSrcset($source.attr("srcset")) ||
      bestUrlFromSrcset($source.attr("data-srcset"));
    if (!best) return;
    const img = $source.parent().find("img").first();
    if (!img.length) return;
    const current = img.attr("src") || "";
    if (!current || isPlaceholderSrc(current)) img.attr("src", best);
  });

  // Resolve relative image and link URLs against the base URL so Claude
  // can return absolute image URLs. Also pull from srcset / data-srcset
  // which many lazy-loading frameworks (WordPress, Shopify, Yoast) use
  // instead of src. Prefer the largest srcset candidate — the last
  // entry is often a small crop, not the high-res file.
  $("img").each((_, el) => {
    const $img = $(el);
    const src = bestImageUrl([
      $img.attr("src"),
      $img.attr("data-src"),
      $img.attr("data-lazy-src"),
      $img.attr("data-original"),
      ...urlsFromSrcset($img.attr("srcset")),
      ...urlsFromSrcset($img.attr("data-srcset")),
      ...urlsFromSrcset($img.attr("data-lazy-srcset")),
    ]);
    const alt = $img.attr("alt") || "";
    if (!src) {
      $img.remove();
      return;
    }
    // Drop the tiny `_public` twin when the card also has `_larger`.
    if (/_public\.(png|jpe?g|webp)$/i.test(src)) {
      const hasLarger = $img
        .parent()
        .find("img")
        .toArray()
        .some((img) => ($(img).attr("src") || "").includes("_larger."));
      if (hasLarger) {
        $img.remove();
        return;
      }
    }
    try {
      const absoluteSrc = new URL(src, url).toString();
      el.attribs = { src: absoluteSrc, alt };
    } catch {
      $img.remove();
    }
  });
  $("a[href]").each((_, el) => {
    const $a = $(el);
    const href = $a.attr("href");
    if (!href) return;
    try {
      $a.attr("href", new URL(href, url).toString());
    } catch {
      // ignore
    }
  });

  // Collapse whitespace so we don't burn tokens on indentation.
  const title = $("title").text().trim();
  const body = ($("body").html() || "").replace(/\s+/g, " ").trim();
  return { url, cleanedHtml: body, title, anchors };
}

function bestUrlFromSrcset(srcset: string | undefined): string | undefined {
  if (!srcset) return undefined;
  // srcset format: "url1 1x, url2 2x" or "url1 100w, url2 200w".
  // Width descriptors are not sorted — Ragno lists 1024w in the middle
  // and a 415w crop last. Score the descriptor and keep the largest.
  let bestUrl: string | undefined;
  let bestScore = -1;
  for (const part of srcset.split(",")) {
    const bits = part.trim().split(/\s+/);
    const candidate = bits[0];
    if (!candidate || isPlaceholderSrc(candidate)) continue;
    const desc = bits[1] ?? "";
    const width = /^(\d+)w$/i.exec(desc);
    const scale = /^([\d.]+)x$/i.exec(desc);
    const score = width
      ? Number(width[1])
      : scale
        ? Number(scale[1]) * 1000
        : 1;
    if (score > bestScore) {
      bestScore = score;
      bestUrl = candidate;
    }
  }
  return bestUrl;
}

function isPlaceholderSrc(src: string): boolean {
  return /data:image|spacer|blank\.gif|1x1|pixel\.gif|placeholder|transparent\.gif/i.test(
    src,
  );
}

const FACTORY_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const RETRY_STATUSES = new Set([403, 429, 503]);

export interface FactoryDocument {
  status: number;
  statusText: string;
  contentType: string;
  bytes: Uint8Array;
}

export async function fetchFactoryDocument(url: string): Promise<FactoryDocument> {
  let lastStatus = 0;
  let lastStatusText = "";
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (attempt > 0) await delay(600 * attempt);
    let res: Response;
    try {
      res = await fetch(url, {
        headers: browserHeaders(attempt),
        redirect: "follow",
      });
    } catch (err) {
      lastStatusText = err instanceof Error ? err.message : "network error";
      continue;
    }
    lastStatus = res.status;
    lastStatusText = res.statusText;
    if (res.ok) {
      const bytes = new Uint8Array(await res.arrayBuffer());
      return {
        status: res.status,
        statusText: res.statusText,
        contentType: res.headers.get("content-type") ?? "",
        bytes,
      };
    }
    if (!RETRY_STATUSES.has(res.status)) break;
  }

  const rendered = await fetchWithChrome(url).catch(() => null);
  if (rendered) return rendered;

  const status = lastStatus || 0;
  throw new Error(
    `Fetch failed: ${status} ${lastStatusText}. The site blocked the automated request` +
      `${status ? ` (HTTP ${status})` : ""}. Save the product page as a PDF in your browser, then use the Upload PDF tab.`,
  );
}

function browserHeaders(attempt: number): Record<string, string> {
  return {
    "User-Agent": FACTORY_UA,
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Cache-Control": attempt === 0 ? "no-cache" : "max-age=0",
    "Upgrade-Insecure-Requests": "1",
  };
}

async function fetchWithChrome(url: string): Promise<FactoryDocument | null> {
  const fs = await import("node:fs");
  const executablePath =
    process.env.PUPPETEER_EXECUTABLE_PATH?.trim() || "/usr/bin/google-chrome";
  if (!fs.existsSync(executablePath)) return null;
  const puppeteer = await import("puppeteer-core");
  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });
  try {
    const page = await browser.newPage();
    await page.setUserAgent(FACTORY_UA);
    const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25_000 });
    await delay(1500);
    const status = response?.status() ?? 0;
    const html = await page.content();
    if (/vercel security checkpoint/i.test(html)) return null;
    if (status === 403 || status === 429 || status === 503) return null;
    if (html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().length < 400) return null;
    return {
      status: status || 200,
      statusText: "OK",
      contentType: "text/html",
      bytes: new TextEncoder().encode(html),
    };
  } finally {
    await browser.close();
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
