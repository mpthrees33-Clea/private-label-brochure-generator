import Link from "next/link";
import { listProducts } from "@/lib/store/products";
import { Download, FileEdit, Plus } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function CrossoverPage() {
  const products = await listProducts();

  // Flatten products × colors → crossover rows
  type Row = {
    productId: string;
    trinityName: string;
    trinityColor: string;
    factory: string;
    factoryName: string;
    factoryColor: string;
    factoryUrl: string;
  };
  const rows: Row[] = [];
  for (const p of products) {
    if (p.colors.length === 0) {
      rows.push({
        productId: p.id,
        trinityName: p.trinityName,
        trinityColor: "",
        factory: p.factory,
        factoryName: p.factoryName,
        factoryColor: "",
        factoryUrl: p.factoryUrl,
      });
    } else {
      for (const c of p.colors) {
        rows.push({
          productId: p.id,
          trinityName: p.trinityName,
          trinityColor: c.trinityName,
          factory: p.factory,
          factoryName: p.factoryName,
          factoryColor: c.trinityName, // factory color name not separately tracked yet
          factoryUrl: p.factoryUrl,
        });
      }
    }
  }

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
            origin. {rows.length} rows · {products.length} collections.
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

      <div className="overflow-x-auto rounded-md border border-divider bg-surface">
        <table className="w-full text-sm">
          <thead className="bg-surface-1 text-left text-xs uppercase tracking-wide text-fg-muted">
            <tr>
              <th className="px-3 py-2">factory</th>
              <th className="px-3 py-2">factory name</th>
              <th className="px-3 py-2">factory color</th>
              <th className="px-3 py-2">Trinity name</th>
              <th className="px-3 py-2">Trinity color</th>
              <th className="px-3 py-2">factory link</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-divider">
                <td className="px-3 py-2">{r.factory}</td>
                <td className="px-3 py-2">{r.factoryName}</td>
                <td className="px-3 py-2 lowercase">{r.factoryColor}</td>
                <td className="px-3 py-2 lowercase">{r.trinityName}</td>
                <td className="px-3 py-2 lowercase">{r.trinityColor}</td>
                <td className="max-w-[260px] truncate px-3 py-2">
                  <a
                    href={r.factoryUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-accent hover:underline"
                  >
                    {r.factoryUrl}
                  </a>
                </td>
                <td className="px-3 py-2">
                  <Link
                    href={`/products/${r.productId}`}
                    className="text-fg-muted hover:text-accent"
                  >
                    <FileEdit className="h-4 w-4" />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <p className="px-3 py-6 text-center text-sm text-fg-muted">
            No products yet. Click{" "}
            <Link href="/internal/scrape" className="text-accent">
              New brochure
            </Link>{" "}
            to scrape your first factory page.
          </p>
        )}
      </div>
    </main>
  );
}
