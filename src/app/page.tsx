import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ArrowRight, Eye, FileText, Table2 } from "lucide-react";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  // Tolerate a missing/uninitialized DB so the dashboard still renders
  // on the first deploy before Postgres is provisioned.
  let recent: { id: string; trinityName: string; factory: string }[] = [];
  try {
    recent = await prisma.product.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { id: true, trinityName: true, factory: true },
    });
  } catch {
    recent = [];
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-10 flex items-center justify-between">
        <div>
          <h1 className="font-brand text-3xl font-extrabold tracking-tight">
            quick flip <span className="text-accent">brochures</span>
          </h1>
          <p className="mt-1 text-sm text-fg-muted">
            Private-label any factory product in 60 seconds.
          </p>
        </div>
        <Link
          href="/new"
          className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white shadow-glow-accent transition hover:bg-accent-light"
        >
          New brochure <ArrowRight className="ml-1 inline h-4 w-4" />
        </Link>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        <Link
          href="/internal/brochure/preview"
          target="_blank"
          className="rounded-lg border border-divider bg-surface p-5 transition hover:border-accent"
        >
          <Eye className="h-5 w-5 text-accent" />
          <h2 className="mt-3 text-base font-semibold">Sample brochure preview</h2>
          <p className="mt-1 text-sm text-fg-muted">
            Hard-coded Kendall sample to validate the template against your reference PDFs.
          </p>
        </Link>
        <Link
          href="/crossover"
          className="rounded-lg border border-divider bg-surface p-5 transition hover:border-accent"
        >
          <Table2 className="h-5 w-5 text-accent" />
          <h2 className="mt-3 text-base font-semibold">Crossover list</h2>
          <p className="mt-1 text-sm text-fg-muted">
            Full private-label master list. Download as XLSX.
          </p>
        </Link>
        <div className="rounded-lg border border-divider bg-surface p-5">
          <FileText className="h-5 w-5 text-accent" />
          <h2 className="mt-3 text-base font-semibold">Recent brochures</h2>
          {recent.length === 0 ? (
            <p className="mt-1 text-sm text-fg-muted">
              No brochures yet. Click <span className="text-fg">New brochure</span> to start.
            </p>
          ) : (
            <ul className="mt-3 space-y-1.5 text-sm">
              {recent.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/products/${p.id}`}
                    className="flex items-center justify-between rounded px-2 py-1 hover:bg-surface-1"
                  >
                    <span className="lowercase">{p.trinityName}</span>
                    <span className="text-fg-faint">{p.factory}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </main>
  );
}
