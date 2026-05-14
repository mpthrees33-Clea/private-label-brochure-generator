"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Trash2 } from "lucide-react";

export function DeleteProductButton({ id }: { id: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function onClick() {
    if (!confirm("Delete this product from the crossover?")) return;
    setLoading(true);
    const res = await fetch(`/api/products/${id}`, { method: "DELETE" });
    if (res.ok) {
      router.push("/crossover");
    } else {
      setLoading(false);
      alert("Failed to delete.");
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className="rounded-md border border-divider bg-surface px-3 py-1.5 text-sm font-medium text-fg-muted transition hover:border-danger hover:text-danger disabled:opacity-60"
    >
      <Trash2 className="mr-1 inline h-4 w-4" />
      {loading ? "…" : "Delete"}
    </button>
  );
}
