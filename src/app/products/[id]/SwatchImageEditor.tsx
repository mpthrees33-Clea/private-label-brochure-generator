"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Image as ImageIcon, ChevronDown, ChevronRight } from "lucide-react";
import type { BrochureColor } from "@/lib/brochure-types";

// Paste-URL editor for swatch images. The factory scraper sometimes
// misses lazy-loaded swatches (or returns URLs that 404). The rep can
// right-click any image on the factory's site, copy the address, and
// paste it here per color.
//
// Auto-opens when any color is missing an image, so the rep doesn't
// have to find a "show me" toggle when the brochure renders with blank
// tiles. Otherwise collapsed.
export function SwatchImageEditor({
  productId,
  colors,
}: {
  productId: string;
  colors: BrochureColor[];
}) {
  const router = useRouter();
  const missingCount = colors.filter((c) => !c.imageUrl || c.imageUrl.trim() === "").length;
  const [open, setOpen] = useState(missingCount > 0);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  function setDraft(key: string, value: string) {
    setDrafts((d) => ({ ...d, [key]: value }));
  }

  async function saveColor(idx: number, field: "imageUrl" | "decoImageUrl") {
    const key = `${idx}:${field}`;
    const value = (drafts[key] ?? "").trim();
    if (!value) return;
    setBusy((b) => ({ ...b, [key]: true }));
    setError(null);
    try {
      const next = colors.map((c, i) =>
        i === idx ? { ...c, [field]: value } : c,
      );
      const res = await fetch(`/api/products/${productId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ colors: next }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error ?? `HTTP ${res.status}`);
      }
      setDrafts((d) => {
        const copy = { ...d };
        delete copy[key];
        return copy;
      });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setBusy((b) => {
        const copy = { ...b };
        delete copy[key];
        return copy;
      });
    }
  }

  if (colors.length === 0) return null;

  return (
    <div className="mb-4 rounded-md border border-divider bg-surface text-xs">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition hover:bg-surface-1"
      >
        <span className="flex items-center gap-2 text-fg">
          <ImageIcon className="h-4 w-4 text-accent" />
          <span className="font-semibold">swatch images</span>
          {missingCount > 0 && (
            <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-[10px] font-semibold text-red-300">
              {missingCount} missing
            </span>
          )}
        </span>
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </button>
      {open && (
        <div className="border-t border-divider px-3 py-3">
          <p className="mb-3 text-[11px] text-fg-muted">
            Right-click any swatch on the factory&apos;s page → <em>Copy image address</em> → paste below per color. Use the deco field for the textured / deco variant if applicable.
          </p>
          <ul className="space-y-3">
            {colors.map((c, idx) => (
              <li key={idx} className="rounded-md border border-divider bg-surface-1 p-2">
                <div className="mb-2 flex items-center gap-2">
                  <span className="text-[11px] uppercase tracking-wider text-fg-faint">color</span>
                  <span className="font-semibold lowercase text-fg">{c.trinityName}</span>
                </div>
                <SwatchRow
                  label="main swatch"
                  current={c.imageUrl}
                  draft={drafts[`${idx}:imageUrl`] ?? ""}
                  busy={!!busy[`${idx}:imageUrl`]}
                  onChange={(v) => setDraft(`${idx}:imageUrl`, v)}
                  onSave={() => saveColor(idx, "imageUrl")}
                />
                <SwatchRow
                  label="deco / textured (optional)"
                  current={c.decoImageUrl ?? ""}
                  draft={drafts[`${idx}:decoImageUrl`] ?? ""}
                  busy={!!busy[`${idx}:decoImageUrl`]}
                  onChange={(v) => setDraft(`${idx}:decoImageUrl`, v)}
                  onSave={() => saveColor(idx, "decoImageUrl")}
                />
              </li>
            ))}
          </ul>
          {error && <p className="mt-2 text-xs text-danger">{error}</p>}
        </div>
      )}
    </div>
  );
}

function SwatchRow({
  label,
  current,
  draft,
  busy,
  onChange,
  onSave,
}: {
  label: string;
  current: string;
  draft: string;
  busy: boolean;
  onChange: (v: string) => void;
  onSave: () => void;
}) {
  const hasCurrent = !!(current && current.trim());
  return (
    <div className="mt-1.5 flex items-center gap-2">
      <div className="h-10 w-5 shrink-0 overflow-hidden rounded-sm border border-divider bg-[#f3f3f3]">
        {hasCurrent ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={current} alt="" className="h-full w-full object-cover" />
        ) : null}
      </div>
      <input
        type="url"
        value={draft}
        onChange={(e) => onChange(e.target.value)}
        placeholder={hasCurrent ? "replace URL…" : `paste ${label} URL`}
        disabled={busy}
        onKeyDown={(e) => {
          if (e.key === "Enter") onSave();
        }}
        className="flex-1 rounded-md border border-divider bg-surface px-2 py-1 text-[11px] text-fg focus:border-accent focus:outline-none"
      />
      <button
        type="button"
        onClick={onSave}
        disabled={busy || !draft.trim()}
        className="rounded-md bg-accent px-2 py-1 text-[11px] font-semibold text-white shadow-glow-accent transition hover:bg-accent-light disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? "…" : "save"}
      </button>
    </div>
  );
}
