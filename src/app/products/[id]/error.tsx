"use client";

import Link from "next/link";
import { useEffect } from "react";

// App-router error boundary for /products/[id]. When the page or any of
// its client subtrees throws after navigation, this surfaces the real
// message (digest in prod, full stack in dev) instead of the generic
// "client-side exception" placeholder.
export default function ProductDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[/products/[id] error]", error);
  }, [error]);

  return (
    <main className="mx-auto max-w-2xl px-6 py-16 text-fg">
      <h1 className="text-xl font-semibold text-danger">
        Something went wrong rendering this product
      </h1>
      <p className="mt-2 text-sm text-fg-muted">
        {error.message || "Unknown error."}
      </p>
      {error.digest && (
        <p className="mt-1 text-xs text-fg-faint">digest: {error.digest}</p>
      )}
      <div className="mt-6 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={reset}
          className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white shadow-glow-accent hover:bg-accent-light"
        >
          Try again
        </button>
        <Link
          href="/"
          className="rounded-md border border-divider bg-surface px-4 py-2 text-sm font-medium text-fg hover:border-accent"
        >
          ← dashboard
        </Link>
      </div>
    </main>
  );
}
