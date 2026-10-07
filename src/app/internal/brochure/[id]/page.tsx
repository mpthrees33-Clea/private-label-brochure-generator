import Link from "next/link";
import { notFound } from "next/navigation";
import { Brochure } from "@/components/brochure/Brochure";
import { getProduct } from "@/lib/store/products";
import { withFactoryLayoutDefaults } from "@/lib/store/factory-layout-defaults";
import { brochurePdfFilename } from "@/lib/pdf/filename";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Server-rendered brochure for a SAVED product. The PDF endpoint
// navigates here for /api/brochure/pdf?source=<id>.
export default async function SavedBrochurePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const product = await getProduct(id);
  if (!product) notFound();

  // Match the editor view: factory-learned defaults compose UNDER the
  // product's own overrides. This keeps the on-screen brochure identical
  // to the PDF, which renders the same component in memory.
  const productWithDefaults = await withFactoryLayoutDefaults(product);

  return (
    <>
      <div className="sticky top-0 z-50 flex items-center justify-between gap-3 bg-bg/80 px-6 py-3 backdrop-blur-sm print:hidden">
        <Link
          href={`/products/${product.id}`}
          className="text-sm text-fg-muted hover:text-accent"
        >
          ← Back to product
        </Link>
        <a
          href={`/api/brochure/pdf?source=${product.id}`}
          download={brochurePdfFilename(product.trinityName, product.id)}
          className="rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-white shadow-glow-accent transition hover:bg-accent-light"
        >
          Download PDF
        </a>
      </div>
      <Brochure data={productWithDefaults} factoryName={product.factoryName} />
    </>
  );
}
