import Link from "next/link";
import { listProducts } from "@/lib/store/products";
import { ArrowRight, Plus, Table2 } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const products = await listProducts();
  const recent = products.slice(0, 8);
  const totalColors = products.reduce((s, p) => s + p.colors.length, 0);

  return (
    <>
      {/* Top brand strip */}
      <div className="border-b border-divider bg-bg">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3 text-xs">
          <div className="flex items-center gap-2 font-medium tracking-wide text-fg-muted">
            <span className="text-accent">●</span>
            <span className="uppercase">Trinity Surfaces</span>
            <span className="text-fg-faint">/ Internal Tools</span>
          </div>
          <a
            href="https://www.trinitysurfaces.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-fg-muted transition hover:text-accent"
          >
            trinitysurfaces.com ↗
          </a>
        </div>
      </div>

      <main className="mx-auto max-w-5xl px-6 py-12">
        {/* Hero */}
        <header className="mb-12 flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-2xl">
            <p className="mb-3 text-xs font-medium uppercase tracking-[0.18em] text-accent">
              Quick Flip Brochures
            </p>
            <h1 className="font-brand text-4xl font-semibold tracking-tight text-fg sm:text-5xl">
              Private-label any factory product{" "}
              <span className="text-accent">in 60 seconds.</span>
            </h1>
            <p className="mt-4 text-base text-fg-muted">
              Paste a factory URL or upload a spec sheet. Claude pulls colors,
              sizes, and tech specs; we render a 2-page Trinity-branded PDF
              and append the SKU to your crossover list.
            </p>
          </div>
          <Link
            href="/internal/scrape"
            className="inline-flex items-center gap-2 rounded-md bg-accent px-5 py-2.5 text-sm font-semibold text-white shadow-glow-accent transition hover:bg-accent-dim"
          >
            <Plus className="h-4 w-4" />
            New brochure
          </Link>
        </header>

        {/* Stats strip */}
        <section className="mb-10 grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-divider bg-divider">
          <Stat figure={products.length.toString()} label={products.length === 1 ? "collection" : "collections"} />
          <Stat figure={totalColors.toString()} label="private-labeled colors" />
          <Stat figure="2" label="page brochure · always" />
        </section>

        {/* Two primary actions */}
        <section className="grid gap-4 sm:grid-cols-2">
          <Link
            href="/internal/scrape"
            className="group flex items-start gap-4 rounded-lg border border-divider bg-bg p-5 transition hover:border-accent hover:shadow-rest"
          >
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-accent-wash text-accent">
              <Plus className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-fg">Scrape a factory URL</h2>
              <p className="mt-0.5 text-sm text-fg-muted">
                Paste any product page. Claude extracts colors, sizes, specs.
              </p>
              <span className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-accent opacity-0 transition group-hover:opacity-100">
                Start <ArrowRight className="h-3 w-3" />
              </span>
            </div>
          </Link>
          <Link
            href="/crossover"
            className="group flex items-start gap-4 rounded-lg border border-divider bg-bg p-5 transition hover:border-accent hover:shadow-rest"
          >
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-accent-wash text-accent">
              <Table2 className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-fg">Crossover list</h2>
              <p className="mt-0.5 text-sm text-fg-muted">
                {products.length}{" "}
                {products.length === 1 ? "collection" : "collections"} saved.
                Export the master XLSX.
              </p>
              <span className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-accent opacity-0 transition group-hover:opacity-100">
                Open <ArrowRight className="h-3 w-3" />
              </span>
            </div>
          </Link>
        </section>

        {/* Recent */}
        <section className="mt-12">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-fg-muted">
              Recent
            </h2>
            {recent.length > 0 && (
              <Link
                href="/crossover"
                className="text-xs font-medium text-accent transition hover:text-accent-dim"
              >
                View all →
              </Link>
            )}
          </div>
          {recent.length === 0 ? (
            <div className="rounded-lg border border-dashed border-divider-strong bg-surface p-8 text-center">
              <p className="text-sm text-fg-muted">
                No products yet. Click{" "}
                <Link href="/internal/scrape" className="font-medium text-accent">
                  New brochure
                </Link>{" "}
                to private-label your first collection.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-divider overflow-hidden rounded-lg border border-divider bg-bg">
              {recent.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/products/${p.id}`}
                    className="flex items-center justify-between gap-4 px-4 py-3 transition hover:bg-surface"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium capitalize text-fg">
                          {p.trinityName}
                        </span>
                        <span className="rounded-full bg-accent-wash px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-accent">
                          {p.factory}
                        </span>
                      </div>
                      <div className="mt-0.5 truncate text-xs text-fg-faint">
                        {p.factoryName} · {p.colors.length}{" "}
                        {p.colors.length === 1 ? "color" : "colors"}
                      </div>
                    </div>
                    <ArrowRight className="h-4 w-4 shrink-0 text-fg-faint transition group-hover:text-accent" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Footer note */}
        <footer className="mt-16 border-t border-divider pt-6">
          <p className="text-xs text-fg-faint">
            Hosted at{" "}
            <span className="font-mono text-fg-muted">
              brochures.clea-solutions.ai
            </span>{" "}
            · gated by HTTP Basic Auth · Trinity-branded by default.
          </p>
        </footer>
      </main>
    </>
  );
}

function Stat({ figure, label }: { figure: string; label: string }) {
  return (
    <div className="bg-bg px-5 py-5">
      <div className="font-brand text-3xl font-semibold tracking-tight text-fg sm:text-4xl">
        {figure}
      </div>
      <div className="mt-1 text-xs uppercase tracking-[0.12em] text-fg-muted">
        {label}
      </div>
    </div>
  );
}
