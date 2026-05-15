import Link from "next/link";
import { listProducts } from "@/lib/store/products";
import { ChevronRight, Download, FileEdit, Plus } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function CrossoverPage() {
  const products = await listProducts();
  const totalColors = products.reduce((sum, p) => sum + p.colors.length, 0);

  return (
    <main className="mx-auto max-w-7xl px-6 py-8 text-fg">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/" className="text-xs text-fg-muted hover:text-accent">
            ← dashboard
          </Link>
          <h1 className="mt-2 font-brand text-3xl font-extrabold tracking-tight">
            crossover list
          </h1>
          <p className="mt-1 text-sm text-fg-muted">
            Master list of every Trinity private-labeled SKU and its factory
            origin. {products.length} collections · {totalColors} colors.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/internal/scrape"
            className="rounded-md border border-divider bg-surface px-3 py-1.5 text-sm font-medium transition hover:border-accent"
          >
            <Plus className="mr-1 inline h-4 w-4" />
            New brochure
          </Link>
          <Link
            href="/api/crossover/xlsx"
            className="rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-white shadow-glow-accent transition hover:bg-accent-light"
          >
            <Download className="mr-1 inline h-4 w-4" />
            Download XLSX
          </Link>
        </div>
      </header>

      <div className="overflow-hidden rounded-md border border-divider bg-surface">
        {/* Column header — matches the per-series summary row below. */}
        <div className="grid grid-cols-[24px_1fr_1fr_1fr_2fr_80px_40px] gap-3 border-b border-divider bg-surface-1 px-3 py-2 text-left text-xs uppercase tracking-wide text-fg-muted">
          <span />
          <span>factory</span>
          <span>factory name</span>
          <span>Trinity name</span>
          <span>factory link</span>
          <span className="text-right">colors</span>
          <span />
        </div>

        {products.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-fg-muted">
            No products yet. Click{" "}
            <Link href="/internal/scrape" className="text-accent">
              New brochure
            </Link>{" "}
            to scrape your first factory page.
          </p>
        ) : (
          products.map((p) => (
            <details key={p.id} className="group border-t border-divider">
              <summary className="grid cursor-pointer grid-cols-[24px_1fr_1fr_1fr_2fr_80px_40px] items-center gap-3 px-3 py-2 text-sm transition hover:bg-surface-1 [&::-webkit-details-marker]:hidden">
                <ChevronRight className="h-4 w-4 text-fg-faint transition group-open:rotate-90" />
                <span>{p.factory}</span>
                <span>{p.factoryName}</span>
                <span className="lowercase">{p.trinityName}</span>
                <a
                  href={p.factoryUrl}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="truncate text-accent hover:underline"
                >
                  {p.factoryUrl}
                </a>
                <span className="text-right text-fg-muted">
                  {p.colors.length}
                </span>
                <Link
                  href={`/products/${p.id}`}
                  onClick={(e) => e.stopPropagation()}
                  className="text-fg-muted hover:text-accent"
                  title="Open brochure"
                >
                  <FileEdit className="h-4 w-4" />
                </Link>
              </summary>
              {p.colors.length > 0 && (
                <div className="border-t border-divider bg-surface-1/60">
                  <div className="grid grid-cols-[24px_1fr_1fr_1fr_2fr_80px_40px] gap-3 px-3 py-1.5 text-[11px] uppercase tracking-wide text-fg-faint">
                    <span />
                    <span />
                    <span />
                    <span>factory color</span>
                    <span>Trinity color</span>
                    <span />
                    <span />
                  </div>
                  {p.colors.map((c) => (
                    <div
                      key={c.trinityName}
                      className="grid grid-cols-[24px_1fr_1fr_1fr_2fr_80px_40px] items-center gap-3 border-t border-divider/50 px-3 py-1.5 text-sm"
                    >
                      <span />
                      <span />
                      <span />
                      <span className="lowercase text-fg-muted">
                        {c.trinityName}
                      </span>
                      <span className="lowercase text-fg-muted">
                        {c.trinityName}
                      </span>
                      <span />
                      <span />
                    </div>
                  ))}
                </div>
              )}
            </details>
          ))
        )}
      </div>

      <p className="mt-4 text-xs text-fg-faint">
        XLSX export preserves the original 6-column row-per-color schema —
        compatible with the reference crossover sheet.
      </p>
    </main>
  );
}
