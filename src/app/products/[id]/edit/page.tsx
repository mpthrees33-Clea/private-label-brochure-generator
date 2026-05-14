import { notFound } from "next/navigation";
import Link from "next/link";
import { getProduct } from "@/lib/store/products";
import { EditProductForm } from "./EditProductForm";

export const dynamic = "force-dynamic";

export default async function EditProductPage({
  params,
}: {
  params: { id: string };
}) {
  const product = await getProduct(params.id);
  if (!product) notFound();

  return (
    <main className="mx-auto max-w-5xl px-6 py-8 text-fg">
      <header className="mb-6">
        <Link
          href={`/products/${product.id}`}
          className="text-xs text-fg-muted hover:text-accent"
        >
          ← back to product
        </Link>
        <h1 className="mt-2 font-brand text-2xl font-extrabold tracking-tight">
          edit <span className="text-accent lowercase">{product.trinityName}</span>
        </h1>
        <p className="mt-1 text-sm text-fg-muted">
          Rename the Trinity collection + each color. Scraped factory data
          shows on the right — read-only for now.
        </p>
      </header>

      <EditProductForm product={product} />
    </main>
  );
}
