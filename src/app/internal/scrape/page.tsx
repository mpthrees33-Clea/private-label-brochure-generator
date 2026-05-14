"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { FACTORIES } from "@/lib/factories";

export default function ScrapeFormPage() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!url) return;
    setLoading(true);
    router.push(`/internal/brochure/scrape?url=${encodeURIComponent(url)}`);
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-10 text-fg">
      <h1 className="font-brand text-3xl font-extrabold tracking-tight">
        private label this collection
      </h1>
      <p className="mt-2 text-sm text-fg-muted">
        Paste a factory product page URL. Claude reads the page, extracts
        the colors, sizes, and tech specs, and renders a Trinity-branded
        brochure you can download as PDF.
      </p>

      <form onSubmit={onSubmit} className="mt-8 space-y-3">
        <label className="block text-sm font-medium">
          Factory product URL
          <input
            type="url"
            required
            autoFocus
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.ragnousa.com/collections/forum-series/"
            className="mt-1 w-full rounded-md border border-divider bg-surface-1 px-3 py-2 text-sm focus:border-accent focus:outline-none"
          />
        </label>

        <button
          type="submit"
          disabled={loading || !url}
          className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white shadow-glow-accent transition hover:bg-accent-light disabled:opacity-60"
        >
          {loading ? "Scraping…" : "Private-label it"}
        </button>
      </form>

      <section className="mt-12">
        <h2 className="text-sm font-semibold text-fg-muted">
          Supported factories
        </h2>
        <ul className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-sm text-fg-muted">
          {FACTORIES.map((f) => (
            <li key={f.display}>
              <span className="text-fg">{f.display}</span>{" "}
              <span className="text-fg-faint">— {f.domains[0]}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-fg-faint">
          Unknown factories work too — Claude reads whatever HTML the
          page returns. If a factory site is heavily JS-rendered, scrape
          may come back partial; we&rsquo;ll add a per-factory adapter
          for those after launch.
        </p>
      </section>

      <p className="mt-12 text-xs text-fg-faint">
        <Link href="/internal/brochure/preview" className="hover:text-accent">
          → see the hard-coded Kendall preview instead
        </Link>
      </p>
    </main>
  );
}
