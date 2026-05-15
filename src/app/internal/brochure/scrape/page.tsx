import { redirect } from "next/navigation";
import Link from "next/link";
import { scrapeProduct } from "@/lib/scrapers";
import { scrapedToBrochure } from "@/lib/scraped-to-brochure";
import { createProduct, findByFactoryUrl } from "@/lib/store/products";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Scrape → auto-create product → redirect to /products/[id]. No
// intermediate "save & open" step — the rep lands on the single
// editing page where all changes (rename, edits, spec backfill,
// download) happen in one place.
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

  // Dedupe — factoryUrl can only be private-labeled once.
  const existing = await findByFactoryUrl(url);
  if (existing) {
    redirect(`/products/${existing.id}`);
  }

  let scraped;
  try {
    scraped = await scrapeProduct(url);
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

  const data = scrapedToBrochure(scraped);
  // Fallback Trinity name if AI didn't suggest one — keeps the product
  // creatable; the rep is forced to rename it on the next page before
  // the Download button enables. (`""` would fail the quality gate.)
  if (!data.trinityName || data.trinityName.trim() === "") {
    data.trinityName = "rename-me";
  }

  const created = await createProduct({
    ...data,
    factory: scraped.factory,
    factoryName: scraped.factoryName,
    factoryUrl: scraped.factoryUrl,
  });

  redirect(`/products/${created.id}`);
}
