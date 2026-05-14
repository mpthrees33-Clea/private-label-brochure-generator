import Link from "next/link";
import { notFound } from "next/navigation";
import { Brochure } from "@/components/brochure/Brochure";
import { getProduct } from "@/lib/store/products";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Server-rendered brochure for a SAVED product. The PDF endpoint
// navigates here for /api/brochure/pdf?source=<id>.
export default async function SavedBrochurePage({
  params,
}: {
  params: { id: string };
}) {
  const product = await getProduct(params.id);
  if (!product) notFound();

  return (
    <>
      <div className="sticky top-0 z-50 flex items-center justify-between gap-3 bg-bg/80 px-6 py-3 backdrop-blur print:hidden">
        <Link
          href={`/products/${product.id}`}
          className="text-sm text-fg-muted hover:text-accent"
        >
          ← Back to product
        </Link>
        <Link
          href={`/api/brochure/pdf?source=${product.id}`}
          target="_blank"
          className="rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-white shadow-glow-accent transition hover:bg-accent-light"
        >
          Download PDF
        </Link>
      </div>
      <Brochure data={product} factoryName={product.factoryName} />
    </>
  );
}
