import Link from "next/link";
import { Brochure } from "@/components/brochure/Brochure";
import { scrapeProduct } from "@/lib/scrapers";
import { scrapedToBrochure } from "@/lib/scraped-to-brochure";
import { SaveToCrossoverButton } from "./SaveToCrossoverButton";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Server-rendered preview of a brochure built from a freshly-scraped
// factory URL. Reachable at /internal/brochure/scrape?url=<factoryUrl>.
// The /api/brochure/pdf endpoint navigates here for PDF output.
export default async function ScrapeRenderPage({
  searchParams,
}: {
  searchParams: { url?: string };
}) {
  const url = searchParams.url;
  if (!url) {
    return (
      <main className="mx-auto max-w-xl px-6 py-10 text-fg">
        Missing <code>?url=</code> param. Go back to{" "}
        <Link href="/internal/scrape" className="text-accent underline">
          /internal/scrape
        </Link>{" "}
        and paste a factory URL.
      </main>
    );
  }

  let data;
  let scraped;
  try {
    scraped = await scrapeProduct(url);
    data = scrapedToBrochure(scraped);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return (
      <main className="mx-auto max-w-xl px-6 py-10 text-fg">
        <h1 className="text-lg font-semibold text-danger">Scrape failed</h1>
        <pre className="mt-3 whitespace-pre-wrap rounded bg-surface-1 p-3 text-xs text-fg-muted">
          {message}
        </pre>
        <p className="mt-4 text-sm text-fg-muted">
          <Link href="/internal/scrape" className="text-accent underline">
            ← Try another URL
          </Link>
        </p>
      </main>
    );
  }

  return (
    <>
      <div className="sticky top-0 z-50 flex items-center justify-between gap-3 bg-bg/80 px-6 py-3 backdrop-blur print:hidden">
        <Link
          href="/internal/scrape"
          className="text-sm text-fg-muted hover:text-accent"
        >
          ← Scrape another
        </Link>
        <div className="flex items-center gap-2">
          <SaveToCrossoverButton
            data={data}
            factory={scraped.factory}
            factoryName={scraped.factoryName}
            factoryUrl={scraped.factoryUrl}
          />
          <Link
            href={`/api/brochure/pdf?source=scrape&url=${encodeURIComponent(url)}`}
            target="_blank"
            className="rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-white shadow-glow-accent transition hover:bg-accent-light"
          >
            Download PDF
          </Link>
        </div>
      </div>
      <Brochure data={data} />
    </>
  );
}
