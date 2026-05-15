import * as cheerio from "cheerio";

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

// Fetch a factory product page and produce a Claude-friendly HTML
// snapshot: chrome (nav/footer) removed, scripts/styles stripped, all
// image and link URLs absolute, whitespace compressed.
export async function fetchAndCleanPage(url: string): Promise<FetchedPage> {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5",
    },
    redirect: "follow",
  });
  if (!res.ok) {
    throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
  }
  const html = await res.text();
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

  // Resolve relative image and link URLs against the base URL so Claude
  // can return absolute image URLs. Also pull from srcset / data-srcset
  // which many lazy-loading frameworks (WordPress, Shopify, Yoast) use
  // instead of src.
  $("img").each((_, el) => {
    const $img = $(el);
    const src =
      $img.attr("src") ||
      $img.attr("data-src") ||
      $img.attr("data-lazy-src") ||
      $img.attr("data-original") ||
      firstUrlFromSrcset($img.attr("srcset")) ||
      firstUrlFromSrcset($img.attr("data-srcset")) ||
      firstUrlFromSrcset($img.attr("data-lazy-srcset"));
    const alt = $img.attr("alt") || "";
    if (!src) {
      $img.remove();
      return;
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

function firstUrlFromSrcset(srcset: string | undefined): string | undefined {
  if (!srcset) return undefined;
  // srcset format: "url1 1x, url2 2x" or "url1 100w, url2 200w".
  // Take the LARGEST candidate (last entry) so we get the highest-res
  // image — swatches benefit from sharpness when downscaled by the
  // brochure renderer.
  const candidates = srcset
    .split(",")
    .map((s) => s.trim().split(/\s+/)[0])
    .filter(Boolean);
  return candidates[candidates.length - 1];
}
