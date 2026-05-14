"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { Brochure } from "@/components/brochure/Brochure";
import type { BrochureData } from "@/lib/brochure-types";

interface ScrapedMeta {
  factory: string;
  factoryName: string;
  factoryUrl: string;
  aiSuggestedTrinityName: string;
}

export function ScrapePreviewClient({
  initial,
  meta,
}: {
  initial: BrochureData;
  meta: ScrapedMeta;
}) {
  const router = useRouter();
  const [trinityName, setTrinityName] = useState(initial.trinityName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const liveData = useMemo<BrochureData>(
    () => ({ ...initial, trinityName: trinityName.toLowerCase() || "(unnamed)" }),
    [initial, trinityName],
  );

  const hasName = trinityName.trim().length > 0;
  const usingFactoryName =
    trinityName.toLowerCase().replace(/\s+/g, "") ===
    meta.factoryName.toLowerCase().replace(/\s+/g, "");

  async function onSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...initial,
          trinityName: trinityName.toLowerCase().trim(),
          factory: meta.factory,
          factoryName: meta.factoryName,
          factoryUrl: meta.factoryUrl,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(json?.error ?? `HTTP ${res.status}`);
      }
      router.push(`/products/${json.product.id}`);
    } catch (err) {
      setSaving(false);
      setError(err instanceof Error ? err.message : "Save failed.");
    }
  }

  return (
    <>
      <div className="sticky top-0 z-50 border-b border-divider/40 bg-bg/85 backdrop-blur print:hidden">
        <div className="mx-auto flex max-w-5xl flex-wrap items-end justify-between gap-4 px-6 py-3">
          <div>
            <Link
              href="/internal/scrape"
              className="text-xs text-fg-muted hover:text-accent"
            >
              ← Scrape another
            </Link>
            <p className="mt-1 text-[11px] uppercase tracking-wider text-fg-faint">
              Factory: {meta.factory} · {meta.factoryName}
            </p>
          </div>
          <div className="flex items-end gap-3">
            <label className="block">
              <span className="block text-[11px] uppercase tracking-wider text-fg-faint">
                Trinity private-label name
              </span>
              <div className="mt-1 flex items-center gap-2">
                <input
                  autoFocus
                  value={trinityName}
                  onChange={(e) => setTrinityName(e.target.value)}
                  placeholder="e.g. kendall"
                  className="w-56 rounded-md border border-divider bg-surface-1 px-3 py-1.5 text-sm lowercase text-fg focus:border-accent focus:outline-none"
                />
                {meta.aiSuggestedTrinityName && trinityName !== meta.aiSuggestedTrinityName && (
                  <button
                    type="button"
                    onClick={() => setTrinityName(meta.aiSuggestedTrinityName)}
                    title={`AI suggested: ${meta.aiSuggestedTrinityName}`}
                    className="rounded-md border border-divider bg-surface px-2 py-1.5 text-xs text-fg-muted transition hover:border-accent hover:text-accent"
                  >
                    <Sparkles className="inline h-3.5 w-3.5" />
                    <span className="ml-1">{meta.aiSuggestedTrinityName}</span>
                  </button>
                )}
              </div>
            </label>
            <button
              type="button"
              onClick={onSave}
              disabled={saving || !hasName || usingFactoryName}
              className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white shadow-glow-accent transition hover:bg-accent-light disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save & open"}
            </button>
          </div>
        </div>
        {usingFactoryName && (
          <p className="mx-auto max-w-5xl px-6 pb-2 text-xs text-danger">
            That&apos;s the factory&apos;s own name — pick a Trinity private-label name (different from {meta.factoryName}).
          </p>
        )}
        {error && (
          <p className="mx-auto max-w-5xl px-6 pb-2 text-xs text-danger">
            {error}
          </p>
        )}
      </div>
      <Brochure data={liveData} />
    </>
  );
}
