"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, FileSearch } from "lucide-react";
import type { MissingField } from "@/lib/brochure-quality";
import { MISSING_FIELD_LABELS } from "@/lib/brochure-quality";

// Surfaces what's missing from the brochure + offers a spec-sheet URL
// backfill for the (common) tech-specs case. Lives at the top of the
// product detail page so the rep can see the gaps before downloading.
export function MissingFieldsPanel({
  productId,
  missing,
}: {
  productId: string;
  missing: MissingField[];
}) {
  const router = useRouter();
  const [specUrl, setSpecUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function onBackfill() {
    if (!specUrl.trim()) return;
    setBusy(true);
    setMessage(null);
    try {
      // 1) ask the AI to extract specs from the URL
      const res = await fetch("/api/scrape/specs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: specUrl.trim() }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
      const incoming = json?.techSpecs ?? {};
      const added = Object.values(incoming).filter(
        (v) => v != null && v !== "",
      ).length;
      if (added === 0) {
        setMessage("No specs found at that URL — try the actual PDF / data-sheet link.");
        return;
      }
      // 2) merge into the product
      const patchRes = await fetch(`/api/products/${productId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ techSpecs: incoming, mergeTechSpecs: true }),
      });
      if (!patchRes.ok) {
        const j = await patchRes.json().catch(() => null);
        throw new Error(j?.error ?? `HTTP ${patchRes.status}`);
      }
      setMessage(`Added ${added} spec${added === 1 ? "" : "s"}.`);
      setSpecUrl("");
      router.refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Backfill failed.");
    } finally {
      setBusy(false);
    }
  }

  if (missing.length === 0) return null;

  return (
    <div className="mb-4 rounded-md border border-red-500/40 bg-red-500/10 p-3 text-xs">
      <div className="flex items-start gap-2">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
        <div className="flex-1">
          <p className="font-semibold text-red-300">
            Cannot download yet — this brochure is missing required info:
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
                Paste a direct link to the factory&apos;s spec sheet, technical-data
                page, or product PDF. Claude reads it and fills in the missing values.
              </p>
              <div className="mt-2 flex gap-2">
                <input
                  type="url"
                  value={specUrl}
                  onChange={(e) => setSpecUrl(e.target.value)}
                  placeholder="https://factory.com/.../spec-sheet.pdf"
                  className="flex-1 rounded-md border border-divider bg-surface-1 px-3 py-1.5 text-sm text-fg focus:border-accent focus:outline-none"
                  disabled={busy}
                />
                <button
                  type="button"
                  onClick={onBackfill}
                  disabled={busy || !specUrl.trim()}
                  className="rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-white shadow-glow-accent transition hover:bg-accent-light disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busy ? "Reading…" : "Backfill"}
                </button>
              </div>
              {message && (
                <p className="mt-2 text-[11px] text-fg-muted">{message}</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
