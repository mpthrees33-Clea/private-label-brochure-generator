import Link from "next/link";
import { notFound } from "next/navigation";
import { getProduct } from "@/lib/store/products";
import { listLessonsForProduct } from "@/lib/store/lessons";
import { missingBrochureFields } from "@/lib/brochure-quality";
import { BrochureEditor } from "@/components/brochure/BrochureEditor";
import { Download, FileEdit } from "lucide-react";
import { DeleteProductButton } from "./DeleteProductButton";
import { EditChat } from "./EditChat";
import { NameEditor } from "./NameEditor";
import { MissingFieldsPanel } from "./MissingFieldsPanel";
import { SwatchImageEditor } from "./SwatchImageEditor";

export const dynamic = "force-dynamic";

// The everything-page. Brochure rendered as it would print; rename
// inline; edit via chat; backfill missing specs from a URL; download
// the PDF. No separate "save and open" step before the rep arrives
// here — the scrape page auto-saves and lands them straight on this.
export default async function ProductDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const product = await getProduct(params.id);
  if (!product) notFound();
  const lessons = await listLessonsForProduct(product.id);
  const missing = missingBrochureFields(product);
  const canDownload = missing.length === 0;
  const needsRename = product.trinityName === "rename-me";

  return (
    <main className="mx-auto max-w-[1400px] px-6 py-8 text-fg">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="flex-1 min-w-0">
          <Link href="/" className="text-xs text-fg-muted hover:text-accent">
            ← dashboard
          </Link>
          <div className="mt-2">
            <NameEditor
              productId={product.id}
              initialName={product.trinityName}
              initialTagline={product.trinityTagline}
              needsRename={needsRename}
            />
          </div>
          <p className="mt-2 text-xs text-fg-muted">
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
            title="Power-user form editor"
          >
            <FileEdit className="mr-1 inline h-4 w-4" />
            Edit fields
          </Link>
          {canDownload ? (
            <Link
              href={`/api/brochure/pdf?source=${product.id}`}
              target="_blank"
              className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white shadow-glow-accent transition hover:bg-accent-light"
            >
              <Download className="mr-1 inline h-4 w-4" />
              Download PDF
            </Link>
          ) : (
            <button
              type="button"
              disabled
              title={`Cannot download — missing: ${missing.join(", ")}`}
              className="cursor-not-allowed rounded-md bg-accent/50 px-4 py-2 text-sm font-semibold text-white opacity-60"
            >
              <Download className="mr-1 inline h-4 w-4" />
              Download PDF
            </button>
          )}
          <DeleteProductButton id={product.id} />
        </div>
      </header>

      <MissingFieldsPanel productId={product.id} missing={missing} />
      <SwatchImageEditor productId={product.id} colors={product.colors} />

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="brochure-stage shrink-0">
          <BrochureEditor
            productId={product.id}
            data={product}
            factoryName={product.factoryName}
          />
          <p className="mt-2 hidden text-[11px] text-fg-muted md:block">
            click any block to select · drag to reposition · snaps to page
            center &amp; margins · &ldquo;reset position&rdquo; restores the default
          </p>
        </div>
        <aside className="w-full lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:flex-1 lg:overflow-y-auto">
          <EditChat productId={product.id} initialLessons={lessons} />
        </aside>
      </div>
    </main>
  );
}
