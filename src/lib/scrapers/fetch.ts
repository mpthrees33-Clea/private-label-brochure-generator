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

  // og:image is often the only room-scene hero, and it lives in <meta>,
  // which we strip below. Promote it to a real <img> first.
  const ogImage =
    $('meta[property="og:image"]').attr("content") ||
    $('meta[name="og:image"]').attr("content");
  if (ogImage) {
    try {
      const absolute = new URL(ogImage, url).toString();
      $("body").prepend(`<img src="${absolute}" alt="room scene hero">`);
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
    const srcsetBest =
      bestUrlFromSrcset($img.attr("srcset")) ||
      bestUrlFromSrcset($img.attr("data-srcset")) ||
      bestUrlFromSrcset($img.attr("data-lazy-srcset"));
    const lazy =
      $img.attr("data-src") ||
      $img.attr("data-lazy-src") ||
      $img.attr("data-original") ||
      "";
    const rawSrc = $img.attr("src") || "";
    const src =
      (rawSrc && !isPlaceholderSrc(rawSrc) ? rawSrc : "") ||
      (lazy && !isPlaceholderSrc(lazy) ? lazy : "") ||
      srcsetBest ||
      rawSrc ||
      lazy;
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
