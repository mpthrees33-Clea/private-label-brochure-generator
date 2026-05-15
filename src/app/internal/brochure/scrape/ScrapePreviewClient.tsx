"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Sparkles, AlertCircle, FileSearch } from "lucide-react";
import { Brochure } from "@/components/brochure/Brochure";
import type { BrochureData, TechSpecs } from "@/lib/brochure-types";
import {
  missingBrochureFields,
  MISSING_FIELD_LABELS,
} from "@/lib/brochure-quality";

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
  const [data, setData] = useState<BrochureData>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Manual spec-sheet URL backfill for factories like Portobello that
  // hide specs in a downloads PDF that anchor scraping misses.
  const [specUrl, setSpecUrl] = useState("");
  const [specBusy, setSpecBusy] = useState(false);
  const [specMessage, setSpecMessage] = useState<string | null>(null);

  const liveData = useMemo<BrochureData>(
    () => ({ ...data, trinityName: trinityName.toLowerCase() || "(unnamed)" }),
    [data, trinityName],
  );

  const missing = useMemo(() => missingBrochureFields(liveData), [liveData]);

  const hasName = trinityName.trim().length > 0;
  const usingFactoryName =
    trinityName.toLowerCase().replace(/\s+/g, "") ===
    meta.factoryName.toLowerCase().replace(/\s+/g, "");
  const canSave =
    !saving && hasName && !usingFactoryName && missing.length === 0;

  async function onSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...data,
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

  async function onBackfillSpecs() {
    if (!specUrl.trim()) return;
    setSpecBusy(true);
    setSpecMessage(null);
    try {
      const res = await fetch("/api/scrape/specs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: specUrl.trim() }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(json?.error ?? `HTTP ${res.status}`);
      }
      const incoming = (json.techSpecs ?? {}) as Partial<TechSpecs>;
      const merged: Partial<TechSpecs> = { ...data.techSpecs };
      for (const [k, v] of Object.entries(incoming)) {
        if (v != null && v !== "") {
          (merged as Record<string, string>)[k] = v as string;
        }
      }
      setData((d) => ({ ...d, techSpecs: merged }));
      const added = Object.values(incoming).filter(
        (v) => v != null && v !== "",
      ).length;
      setSpecMessage(`Added ${added} spec${added === 1 ? "" : "s"} from that URL.`);
      setSpecUrl("");
    } catch (err) {
      setSpecMessage(err instanceof Error ? err.message : "Backfill failed.");
    } finally {
      setSpecBusy(false);
    }
  }

  return (
    <>
      <div className="sticky top-0 z-40 border-b border-divider/40 bg-bg/85 backdrop-blur print:hidden">
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
              disabled={!canSave}
              className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white shadow-glow-accent transition hover:bg-accent-light disabled:cursor-not-allowed disabled:opacity-50"
              title={
                missing.length > 0
                  ? `Cannot save — missing: ${missing.map((m) => MISSING_FIELD_LABELS[m]).join(", ")}`
                  : ""
              }
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

        {missing.length > 0 && (
          <div className="border-t border-red-500/30 bg-red-500/10">
            <div className="mx-auto max-w-5xl px-6 py-3 text-xs text-fg">
              <div className="flex items-start gap-2">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
                <div className="flex-1">
                  <p className="font-semibold text-red-300">
                    Cannot save — this brochure is missing required info:
                  </p>
                  <ul className="mt-1 list-disc pl-5 text-fg-muted">
                    {missing.map((m) => (
                      <li key={m}>{MISSING_FIELD_LABELS[m]}</li>
                    ))}
                  </ul>
                  {missing.includes("tech-specs") && (
                    <div className="mt-3 rounded-md border border-divider bg-surface p-3">
                      <p className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-fg-faint">
                        <FileSearch className="h-3.5 w-3.5" />
                        Backfill specs from a URL
                      </p>
                      <p className="mt-1 text-[11px] text-fg-muted">
                        Paste a direct link to the factory&apos;s spec sheet, technical data page, or product PDF. Claude reads it and fills in the missing values.
                      </p>
                      <div className="mt-2 flex gap-2">
                        <input
                          type="url"
                          value={specUrl}
                          onChange={(e) => setSpecUrl(e.target.value)}
                          placeholder="https://factory.com/.../spec-sheet.pdf"
                          className="flex-1 rounded-md border border-divider bg-surface-1 px-3 py-1.5 text-sm text-fg focus:border-accent focus:outline-none"
                          disabled={specBusy}
                        />
                        <button
                          type="button"
                          onClick={onBackfillSpecs}
                          disabled={specBusy || !specUrl.trim()}
                          className="rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-white shadow-glow-accent transition hover:bg-accent-light disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {specBusy ? "Reading…" : "Backfill"}
                        </button>
                      </div>
                      {specMessage && (
                        <p className="mt-2 text-[11px] text-fg-muted">
                          {specMessage}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      <Brochure data={liveData} factoryName={meta.factoryName} />
    </>
  );
}
