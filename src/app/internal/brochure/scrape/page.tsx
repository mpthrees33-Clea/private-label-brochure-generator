import Link from "next/link";
import { scrapeProduct } from "@/lib/scrapers";
import { scrapedToBrochure } from "@/lib/scraped-to-brochure";
import { findByFactoryUrl } from "@/lib/store/products";
import { ScrapePreviewClient } from "./ScrapePreviewClient";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

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

  // Dedupe BEFORE scraping. The crossover is the source of truth — a
  // factory product can only be private-labeled once. See feedback
  // memory `brochure-crossover-dedupe`.
  const existing = await findByFactoryUrl(url);
  if (existing) {
    return (
      <main className="mx-auto max-w-xl px-6 py-16 text-fg">
        <h1 className="font-brand text-2xl font-extrabold tracking-tight">
          already private-labeled
        </h1>
        <p className="mt-3 text-sm text-fg-muted">
          This factory page is already in the crossover as{" "}
          <span className="font-semibold lowercase text-fg">
            {existing.trinityName}
          </span>{" "}
          ({existing.factory} → {existing.factoryName}).
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <Link
            href={`/products/${existing.id}`}
            className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white shadow-glow-accent transition hover:bg-accent-light"
          >
            Open {existing.trinityName}
          </Link>
          <Link
            href="/internal/scrape"
            className="rounded-md border border-divider bg-surface px-4 py-2 text-sm font-medium text-fg transition hover:border-accent"
          >
            ← Scrape a different URL
          </Link>
        </div>
        <p className="mt-8 text-xs text-fg-faint">
          To private-label this factory product under a different name, delete
          the existing record first.
        </p>
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
    <ScrapePreviewClient
      initial={data}
      meta={{
        factory: scraped.factory,
        factoryName: scraped.factoryName,
        factoryUrl: scraped.factoryUrl,
        aiSuggestedTrinityName: scraped.suggestedTrinityName,
      }}
    />
  );
}
