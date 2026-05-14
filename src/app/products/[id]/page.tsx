import Link from "next/link";
import { notFound } from "next/navigation";
import { getProduct } from "@/lib/store/products";
import { listLessonsForProduct } from "@/lib/store/lessons";
import { Brochure } from "@/components/brochure/Brochure";
import { Download, FileEdit } from "lucide-react";
import { DeleteProductButton } from "./DeleteProductButton";
import { EditChat } from "./EditChat";

export const dynamic = "force-dynamic";

export default async function ProductDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const product = await getProduct(params.id);
  if (!product) notFound();
  const lessons = await listLessonsForProduct(product.id);

  return (
    <main className="mx-auto max-w-[1400px] px-6 py-8 text-fg">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link
            href="/"
            className="text-xs text-fg-muted hover:text-accent"
          >
            ← dashboard
          </Link>
          <h1 className="mt-2 font-brand text-3xl font-extrabold tracking-tight lowercase">
            {product.trinityName}
          </h1>
          <p className="mt-1 text-sm text-fg-muted">
            {product.factory} → {product.factoryName} ·{" "}
            <a
              href={product.factoryUrl}
              target="_blank"
              rel="noreferrer"
              className="text-accent hover:underline"
            >
              source
            </a>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href={`/products/${product.id}/edit`}
            className="rounded-md border border-divider bg-surface px-3 py-1.5 text-sm font-medium transition hover:border-accent"
          >
            <FileEdit className="mr-1 inline h-4 w-4" />
            Edit fields
          </Link>
          <Link
            href={`/api/brochure/pdf?source=${product.id}`}
            target="_blank"
            className="rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-white shadow-glow-accent transition hover:bg-accent-light"
          >
            <Download className="mr-1 inline h-4 w-4" />
            Download PDF
          </Link>
          <DeleteProductButton id={product.id} />
        </div>
      </header>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="shrink-0">
          <Brochure data={product} />
        </div>
        <aside className="w-full lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:flex-1 lg:overflow-y-auto">
          <EditChat productId={product.id} initialLessons={lessons} />
        </aside>
      </div>
    </main>
  );
}
