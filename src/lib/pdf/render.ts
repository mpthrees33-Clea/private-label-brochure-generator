import puppeteer, { type Browser } from "puppeteer-core";
import chromium from "@sparticuz/chromium-min";
import { PDFDocument } from "pdf-lib";
import { IMAGE_UA, isDeniedImageHost } from "@/lib/image-fetch";

// @sparticuz/chromium-min downloads a Chromium build (plus the shared
// libraries Amazon Linux 2023 stripped out) to /tmp on first launch.
// The pack version must match the installed npm package. Vercel
// functions are x64; set CHROMIUM_PACK_URL to host the tar closer than
// GitHub if cold starts are slow. Leave PUPPETEER_EXECUTABLE_PATH unset
// on Vercel so this path is used. On the VPS, set
// PUPPETEER_EXECUTABLE_PATH to system Chrome instead.
// puppeteer-core 25.12 drives Chrome 154. The newest Sparticuz pack
// published for Lambda is 153, which is the closest build that still
// matches this package's headless-shell launch path.
const CHROMIUM_VERSION = "v153.0.0";
const DEFAULT_PACK_URL =
  process.arch === "arm64"
    ? `https://github.com/Sparticuz/chromium/releases/download/${CHROMIUM_VERSION}/chromium-${CHROMIUM_VERSION}-pack.arm64.tar`
    : `https://github.com/Sparticuz/chromium/releases/download/${CHROMIUM_VERSION}/chromium-${CHROMIUM_VERSION}-pack.x64.tar`;

function chromiumPackUrl(): string {
  const override = process.env.CHROMIUM_PACK_URL?.trim();
  return override || DEFAULT_PACK_URL;
}

// chromium-min exposes setGraphicsMode as a setter. Disabling graphics
// skips the swiftshader extract; brochure PDFs don't need WebGL.
type ChromiumExtras = { setGraphicsMode: boolean };
const chromiumExt = chromium as unknown as ChromiumExtras;
chromiumExt.setGraphicsMode = false;

// Cache the browser PROMISE (not the resolved browser) so concurrent
// requests on a warm function instance share one launch. Closing the
// browser between invocations is what causes ETXTBSY — keep it warm
// and only close pages.
let browserPromise: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
  const existing = browserPromise && (await browserPromise.catch(() => null));
  if (existing && existing.connected) return existing;
  browserPromise = launchBrowserWithRetry();
  return browserPromise;
}

// Args for a real system chromium (VPS, local dev). The sparticuz lambda
// flags include --no-zygote and other AWS-Lambda knobs that misbehave
// on a normal multi-process Chrome.
const SYSTEM_CHROMIUM_ARGS = [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage",
  "--disable-gpu",
  "--hide-scrollbars",
  "--mute-audio",
];

async function launchBrowserWithRetry(maxRetries = 4): Promise<Browser> {
  const local = process.env.PUPPETEER_EXECUTABLE_PATH?.trim();
  const executablePath = local || (await chromium.executablePath(chromiumPackUrl()));
  const headless = local ? true : "shell";
  const args = local
    ? SYSTEM_CHROMIUM_ARGS
    : await puppeteer.defaultArgs({ args: chromium.args, headless: "shell" });

  let lastErr: unknown;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await puppeteer.launch({
        args,
        defaultViewport: { width: 816, height: 1056 },
        executablePath,
        headless,
      });
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      // ETXTBSY = chromium binary still being written to /tmp.
      if (msg.includes("ETXTBSY") || msg.includes("EBUSY")) {
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

function isInPageImageUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
  if (isDeniedImageHost(parsed.hostname)) return false;
  const appHosts = new Set<string>();
  for (const value of [process.env.VERCEL_URL, process.env.NEXTAUTH_URL, process.env.VERCEL_BRANCH_URL]) {
    if (!value) continue;
    try {
      appHosts.add(value.includes("://") ? new URL(value).hostname : value);
    } catch {
      appHosts.add(value);
    }
  }
  if (appHosts.has(parsed.hostname)) return false;
  return true;
}

export async function renderBrochurePdf(html: string): Promise<Uint8Array> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 816, height: 1056, deviceScaleFactor: 2 });
    await page.setUserAgent({ userAgent: IMAGE_UA });
    // Print media applies the @page letter/margin rules baked into the
    // inlined stylesheet. setContent does not navigate. Inlined images
    // are data URIs. A factory URL is allowed only as a fallback when
    // server-side inlining failed. Reaching this app (loopback,
    // deployment host, /api, /_next) is still a bug.
    const leaked: string[] = [];
    const inPage: string[] = [];
    page.on("request", (req) => {
      const url = req.url();
      if (url.startsWith("data:") || url === "about:blank") return;
      if (isInPageImageUrl(url)) {
        inPage.push(url);
        return;
      }
      leaked.push(url);
    });
    await page.emulateMediaType("print");
    await page.setContent(html, { waitUntil: "load", timeout: 45000 });
    if (leaked.length > 0) {
      throw new Error(
        `PDF render tried to fetch outside the inlined document: ${leaked.slice(0, 5).join(", ")}`,
      );
    }
    if (inPage.length > 0) {
      console.error(
        `brochure PDF fetched ${inPage.length} image(s) in-page: ${inPage
          .slice(0, 6)
          .map((url) => url.slice(0, 160))
          .join(" | ")}`,
      );
    }
    await page.evaluate(async () => {
      if (document.fonts?.ready) await document.fonts.ready;
      await Promise.all(
        Array.from(document.images).map(async (img) => {
          if (img.complete && img.naturalWidth > 1) return;
          if (typeof img.decode === "function") {
            await img.decode().catch(() => {});
          }
        }),
      );
    });
    const blank = await page.evaluate(() =>
      Array.from(document.images)
        .filter((img) => img.naturalWidth <= 1 || img.naturalHeight <= 1)
        .map((img) => `${img.alt || "image"} ${img.naturalWidth}x${img.naturalHeight}`),
    );
    if (blank.length > 0) {
      console.error(`brochure PDF blank photos: ${blank.join("; ")}`);
      throw new Error(
        `Brochure photos did not load (${blank.join("; ")}). Refusing to build a PDF with blank image slots.`,
      );
    }

    const pdfBytes = await page.pdf({
      format: "Letter",
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
    });

    // 2-page assertion — hard requirement per the project brief.
    const pdf = await PDFDocument.load(pdfBytes);
    const pages = pdf.getPageCount();
    if (pages !== 2) {
      throw new Error(
        `Brochure rendered ${pages} pages, but must be exactly 2. ` +
          `Tighten the renderer or shrink swatches.`,
      );
    }

    return pdfBytes;
  } finally {
    await page.close().catch(() => {});
  }
}
