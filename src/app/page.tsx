import Link from "next/link";
import { listProducts } from "@/lib/store/products";
import { ArrowRight, Eye, Plus, Table2 } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const products = await listProducts();
  const recent = products.slice(0, 8);

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-10 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-brand text-3xl font-extrabold tracking-tight">
            quick flip <span className="text-accent">brochures</span>
          </h1>
          <p className="mt-1 text-sm text-fg-muted">
            Private-label any factory product in 60 seconds. Trinity-branded
            PDF + master crossover list.
          </p>
        </div>
        <Link
          href="/internal/scrape"
          className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white shadow-glow-accent transition hover:bg-accent-light"
        >
          <Plus className="mr-1 inline h-4 w-4" />
          New brochure
        </Link>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        <Link
          href="/internal/scrape"
          className="rounded-lg border border-divider bg-surface p-5 transition hover:border-accent"
        >
          <Plus className="h-5 w-5 text-accent" />
          <h2 className="mt-3 text-base font-semibold">Scrape a factory URL</h2>
          <p className="mt-1 text-sm text-fg-muted">
            Paste any product page from a supported factory — Claude
            extracts the colors, sizes, and specs.
          </p>
        </Link>
        <Link
          href="/internal/brochure/preview"
          target="_blank"
          className="rounded-lg border border-divider bg-surface p-5 transition hover:border-accent"
        >
          <Eye className="h-5 w-5 text-accent" />
          <h2 className="mt-3 text-base font-semibold">Sample brochure</h2>
          <p className="mt-1 text-sm text-fg-muted">
            Hard-coded Kendall layout to compare against your reference PDFs.
          </p>
        </Link>
        <Link
          href="/crossover"
          className="rounded-lg border border-divider bg-surface p-5 transition hover:border-accent"
        >
          <Table2 className="h-5 w-5 text-accent" />
          <h2 className="mt-3 text-base font-semibold">Crossover list</h2>
          <p className="mt-1 text-sm text-fg-muted">
            {products.length} {products.length === 1 ? "collection" : "collections"}{" "}
            saved. Export as XLSX.
          </p>
        </Link>
      </div>

      <section className="mt-10">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-fg-muted">
          Recent
        </h2>
        {recent.length === 0 ? (
          <p className="rounded-lg border border-divider bg-surface p-5 text-sm text-fg-muted">
            No products yet. Click{" "}
            <Link href="/internal/scrape" className="text-accent">
              New brochure
            </Link>
            .
          </p>
        ) : (
          <ul className="divide-y divide-divider rounded-lg border border-divider bg-surface">
            {recent.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/products/${p.id}`}
                  className="flex items-center justify-between px-4 py-3 transition hover:bg-surface-1"
                >
                  <div>
                    <div className="font-medium lowercase">{p.trinityName}</div>
                    <div className="text-xs text-fg-faint">
                      {p.factory} → {p.factoryName} ·{" "}
                      {p.colors.length} colors
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-fg-faint" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="mt-10 text-xs text-fg-faint">
        V1 storage is ephemeral (resets when the Vercel serverless instance
        recycles ~15 min after idle). To persist products across days,
        provision a Postgres database and swap in <code>src/lib/store</code>.
      </p>
    </main>
  );
}
