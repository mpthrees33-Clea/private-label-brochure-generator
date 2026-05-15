import puppeteer, { type Browser } from "puppeteer-core";
import chromium from "@sparticuz/chromium-min";
import { PDFDocument } from "pdf-lib";

// @sparticuz/chromium-min downloads the chromium binary + shared libs
// from GitHub releases to /tmp at runtime. This avoids the libnss3
// "shared object not found" error that the bundled @sparticuz/chromium
// package hits on Vercel's newer Node runtimes (Amazon Linux 2023
// strips libraries the binary needs).
const CHROMIUM_PACK_URL =
  "https://github.com/Sparticuz/chromium/releases/download/v131.0.1/chromium-v131.0.1-pack.tar";

// chromium-min has loose types — these properties exist at runtime
// (setters that flip internal flags + a readonly `headless` field)
// but aren't declared. Cast to a permissive shape for access.
type ChromiumExtras = {
  setHeadlessMode: boolean;
  setGraphicsMode: boolean;
  readonly headless: boolean | "shell";
};
const chromiumExt = chromium as unknown as ChromiumExtras;
chromiumExt.setHeadlessMode = true;
chromiumExt.setGraphicsMode = false;

// Render a brochure page (e.g. /internal/brochure/<id>) to a Letter-size
// PDF buffer. Asserts page count === 2 — brochures must never silently
// truncate the tech specs or spill onto page 3. See feedback_brochure_two_pages.
// Cache the browser PROMISE (not the resolved browser) so concurrent
// requests on a warm function instance share one launch. Closing the
// browser between invocations is what causes ETXTBSY in the first
// place — we keep it warm and only close pages.
let browserPromise: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
  const existing = browserPromise && (await browserPromise.catch(() => null));
  if (existing && existing.connected) return existing;
  browserPromise = launchBrowserWithRetry();
  return browserPromise;
}

async function launchBrowserWithRetry(maxRetries = 4): Promise<Browser> {
  const local = process.env.PUPPETEER_EXECUTABLE_PATH;
  const executablePath = local || (await chromium.executablePath(CHROMIUM_PACK_URL));

  let lastErr: unknown;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await puppeteer.launch({
        args: chromium.args,
        defaultViewport: { width: 816, height: 1056 },
        executablePath,
        headless: chromiumExt.headless === "shell" ? "shell" : true,
      });
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      // ETXTBSY = chromium binary still being written to /tmp.
      // EBUSY = similar fs lock issue.
      if (msg.includes("ETXTBSY") || msg.includes("EBUSY")) {
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

export async function renderBrochurePdf(brochureUrl: string): Promise<Uint8Array> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 816, height: 1056, deviceScaleFactor: 2 });
    // domcontentloaded is enough — Next.js RSC streaming keeps a connection
    // open so networkidle0 would never fire. We manually wait for all images
    // to finish loading below, which is the actual signal we care about.
    await page.goto(brochureUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    // Wait for every image to load OR error OR hit a per-image timeout.
    // A hanging factory image (slow CDN, dead URL) used to keep this
    // promise pending until the Vercel function killed the request,
    // which surfaced as a grey screen in the browser. Now each image
    // gets at most 5 seconds; after that we render whatever's there.
    await page.evaluate(async (perImageTimeoutMs: number) => {
      const imgs = Array.from(document.images);
      await Promise.all(
        imgs.map(
          (img) =>
            new Promise<void>((resolve) => {
              if (img.complete && img.naturalHeight !== 0) {
                resolve();
                return;
              }
              const timer = setTimeout(() => resolve(), perImageTimeoutMs);
              img.addEventListener(
                "load",
                () => {
                  clearTimeout(timer);
                  resolve();
                },
                { once: true },
              );
              img.addEventListener(
                "error",
                () => {
                  clearTimeout(timer);
                  resolve();
                },
                { once: true },
              );
            }),
        ),
      );
    }, 5000);

    const pdfBytes = await page.pdf({
      format: "Letter",
      printBackground: true,
      // Use the CSS @page rule (letter, margin 0) so Chromium and our
      // print stylesheet agree on the page geometry.
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
    // Close the page but keep the browser warm for the next invocation.
    await page.close().catch(() => {});
  }
}
