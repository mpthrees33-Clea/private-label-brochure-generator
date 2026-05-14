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
export async function renderBrochurePdf(brochureUrl: string): Promise<Uint8Array> {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 816, height: 1056, deviceScaleFactor: 2 });
    await page.goto(brochureUrl, { waitUntil: "networkidle0", timeout: 30000 });
    // Wait for hero + swatches to actually load (`networkidle0` is a strong
    // signal, but be extra safe for the lifestyle photo).
    await page.evaluate(async () => {
      const imgs = Array.from(document.images);
      await Promise.all(
        imgs.map((img) =>
          img.complete && img.naturalHeight !== 0
            ? Promise.resolve()
            : new Promise<void>((resolve) => {
                img.addEventListener("load", () => resolve(), { once: true });
                img.addEventListener("error", () => resolve(), { once: true });
              }),
        ),
      );
    });

    const pdfBytes = await page.pdf({
      format: "Letter",
      printBackground: true,
      preferCSSPageSize: false,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
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
    await browser.close();
  }
}

async function launchBrowser(): Promise<Browser> {
  // Local dev: use system Chrome if PUPPETEER_EXECUTABLE_PATH is set.
  // Production: download chromium + libs from GitHub at request time.
  const local = process.env.PUPPETEER_EXECUTABLE_PATH;
  const executablePath = local || (await chromium.executablePath(CHROMIUM_PACK_URL));

  return puppeteer.launch({
    args: chromium.args,
    defaultViewport: { width: 816, height: 1056 },
    executablePath,
    headless: chromiumExt.headless === "shell" ? "shell" : true,
  });
}
