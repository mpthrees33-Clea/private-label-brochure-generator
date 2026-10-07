"use client";

import { useEffect, useState } from "react";

// The scrape is a server render that can sit for one to two minutes
// (page fetch, product extraction, then the spec-sheet pass). Without
// this, the rep only sees a blank navigation after "Scraping…".
export function ScrapeProgress() {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  const stage =
    elapsed < 12
      ? "Fetching the factory page"
      : elapsed < 45
        ? "Extracting colors, sizes, and photos"
        : elapsed < 90
          ? "Reading the technical spec sheet"
          : "Still working — large collections can take about two minutes";

  const eta =
    elapsed < 90
      ? `Usually finishes within 1–2 minutes. Elapsed ${elapsed}s.`
      : `Elapsed ${elapsed}s. If this fails, the error will show on this page — the product is not saved until extraction finishes.`;

  return (
    <main className="mx-auto max-w-xl px-6 py-16 text-fg">
      <h1 className="font-brand text-2xl font-extrabold tracking-tight">
        Building the brochure
      </h1>
      <p className="mt-3 text-sm text-fg">{stage}…</p>
      <p className="mt-2 text-xs text-fg-muted">{eta}</p>
      <div className="mt-6 h-1.5 overflow-hidden rounded-full bg-surface-1">
        <div
          className="h-full rounded-full bg-accent transition-all"
          style={{ width: `${Math.min(95, 8 + elapsed)}%` }}
        />
      </div>
    </main>
  );
}
