"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check } from "lucide-react";
import type { BrochureData } from "@/lib/brochure-types";

export function SaveToCrossoverButton({
  data,
  factory,
  factoryName,
  factoryUrl,
}: {
  data: BrochureData;
  factory: string;
  factoryName: string;
  factoryUrl: string;
}) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    setState("saving");
    setError(null);
    try {
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, factory, factoryName, factoryUrl }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error ?? `HTTP ${res.status}`);
      }
      const json = await res.json();
      setState("saved");
      router.push(`/products/${json.product.id}/edit`);
    } catch (err) {
      setState("error");
      setError(err instanceof Error ? err.message : "Unknown error");
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={state === "saving" || state === "saved"}
      className="rounded-md border border-divider bg-surface px-3 py-1.5 text-sm font-medium text-fg transition hover:border-accent disabled:opacity-60"
    >
      {state === "saving"
        ? "Saving…"
        : state === "saved"
          ? (
              <>
                <Check className="mr-1 inline h-4 w-4 text-success" />
                Saved
              </>
            )
          : state === "error"
            ? `Error: ${error}`
            : "Save to crossover"}
    </button>
  );
}
