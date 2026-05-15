"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Check, X } from "lucide-react";

// Inline Trinity-name + tagline editor. Click the name (or the pencil)
// to edit. Enter/blur saves via PATCH /api/products/[id]. Cancel via
// Escape. Saved fields update everywhere on the page through a
// router.refresh() round-trip.
export function NameEditor({
  productId,
  initialName,
  initialTagline,
  needsRename,
}: {
  productId: string;
  initialName: string;
  initialTagline: string;
  needsRename: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(needsRename);
  const [name, setName] = useState(initialName);
  const [tagline, setTagline] = useState(initialTagline);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function cancel() {
    setName(initialName);
    setTagline(initialTagline);
    setEditing(false);
    setError(null);
  }

  async function save() {
    const cleanedName = name.toLowerCase().trim();
    const cleanedTagline = tagline.trim();
    if (!cleanedName) {
      setError("Name is required.");
      return;
    }
    if (cleanedName === initialName && cleanedTagline === initialTagline) {
      setEditing(false);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/products/${productId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trinityName: cleanedName,
          trinityTagline: cleanedTagline,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error ?? `HTTP ${res.status}`);
      }
      setEditing(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <div className="group">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-left transition hover:opacity-80"
          title="Click to rename"
        >
          <h1 className="font-brand text-3xl font-extrabold tracking-tight lowercase">
            {initialName}
            <Pencil className="ml-2 inline h-4 w-4 align-middle text-fg-faint opacity-0 transition group-hover:opacity-100" />
          </h1>
          {initialTagline && (
            <p className="mt-1 text-sm text-fg-muted">{initialTagline}</p>
          )}
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-accent bg-surface p-3">
      <label className="block">
        <span className="block text-[11px] uppercase tracking-wider text-fg-faint">
          Trinity private-label name
        </span>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            else if (e.key === "Escape") cancel();
          }}
          disabled={saving}
          placeholder="e.g. kendall"
          className="mt-1 w-full rounded-md border border-divider bg-surface-1 px-3 py-1.5 text-2xl lowercase text-fg focus:border-accent focus:outline-none"
        />
      </label>
      <label className="mt-2 block">
        <span className="block text-[11px] uppercase tracking-wider text-fg-faint">
          Tagline
        </span>
        <input
          value={tagline}
          onChange={(e) => setTagline(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            else if (e.key === "Escape") cancel();
          }}
          disabled={saving}
          placeholder="e.g. thru color porcelain tile, made in usa"
          className="mt-1 w-full rounded-md border border-divider bg-surface-1 px-3 py-1.5 text-sm lowercase text-fg focus:border-accent focus:outline-none"
        />
      </label>
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-1 rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-white shadow-glow-accent transition hover:bg-accent-light disabled:opacity-50"
        >
          <Check className="h-3.5 w-3.5" />
          {saving ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={cancel}
          disabled={saving}
          className="inline-flex items-center gap-1 rounded-md border border-divider bg-surface-1 px-3 py-1.5 text-sm text-fg-muted hover:border-accent"
        >
          <X className="h-3.5 w-3.5" />
          Cancel
        </button>
      </div>
    </div>
  );
}
