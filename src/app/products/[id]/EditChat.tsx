"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, ArrowRight, Undo2 } from "lucide-react";
import type { Lesson } from "@/lib/store/lessons";

const PROMPT_HINTS = [
  "Make the description 2 short sentences focused on commercial use",
  "Reorder colors light to dark",
  "Drop the bullnose size",
  "Set DCOF to '≥ 0.42 wet'",
];

export function EditChat({
  productId,
  initialLessons,
}: {
  productId: string;
  initialLessons: Lesson[];
}) {
  const router = useRouter();
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState(false);
  const [undoing, setUndoing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>(initialLessons);

  async function onUndo() {
    if (lessons.length === 0 || undoing) return;
    if (!confirm("Undo the last edit? The brochure will be restored to its state before this edit.")) return;
    setUndoing(true);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch(`/api/products/${productId}/revert`, {
        method: "POST",
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
      setLessons((prev) => prev.slice(1));
      setInfo(`Reverted: "${json.revertedInstruction ?? "last edit"}".`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Undo failed.");
    } finally {
      setUndoing(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!instruction.trim()) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch(`/api/products/${productId}/edit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);

      // No-op edit: show the explanation, don't clear the textarea or
      // save a "lesson" — the rep can rephrase and try again.
      if (json?.noop) {
        setError(json.changeSummary || "No changes were applied.");
        return;
      }

      setInstruction("");
      if (json?.changeSummary) {
        setLessons((prev) => [
          {
            id: "pending-" + Date.now(),
            productId,
            factoryUrl: "",
            factory: "",
            instruction,
            summary: json.changeSummary,
            before: {} as Lesson["before"],
            after: {} as Lesson["after"],
            createdAt: new Date().toISOString(),
          },
          ...prev,
        ]);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Edit failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border border-divider bg-surface p-4 text-fg">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-accent" />
        <h2 className="text-sm font-semibold">make edits</h2>
      </div>
      <p className="text-xs text-fg-muted">
        Tell Claude what to fix in plain English. Each correction becomes a
        rule future scrapes apply automatically.
      </p>

      <form onSubmit={onSubmit} className="flex flex-col gap-2">
        <textarea
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          rows={3}
          placeholder="e.g. make the description shorter and reorder colors light-to-dark"
          disabled={busy}
          className="w-full rounded-md border border-divider bg-surface-1 px-3 py-2 text-sm text-fg focus:border-accent focus:outline-none disabled:opacity-60"
        />
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] text-fg-faint">
            ⌘+Enter to apply
          </span>
          <button
            type="submit"
            disabled={busy || !instruction.trim()}
            className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-white shadow-glow-accent transition hover:bg-accent-light disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "Applying…" : "Apply edit"}
            {!busy && <ArrowRight className="h-3.5 w-3.5" />}
          </button>
        </div>
        {error && <p className="text-xs text-danger">{error}</p>}
        {info && <p className="text-xs text-fg-muted">{info}</p>}
      </form>

      {instruction.length === 0 && (
        <div className="flex flex-wrap gap-1.5">
          {PROMPT_HINTS.map((h) => (
            <button
              key={h}
              type="button"
              onClick={() => setInstruction(h)}
              className="rounded-full border border-divider bg-surface-1 px-2.5 py-1 text-[11px] text-fg-muted transition hover:border-accent hover:text-accent"
            >
              {h}
            </button>
          ))}
        </div>
      )}

      {lessons.length > 0 && (
        <div className="mt-2 border-t border-divider pt-3">
          <div className="mb-1.5 flex items-center justify-between">
            <h3 className="text-[11px] uppercase tracking-wider text-fg-faint">
              past edits ({lessons.length})
            </h3>
            <button
              type="button"
              onClick={onUndo}
              disabled={undoing}
              className="inline-flex items-center gap-1 rounded-md border border-divider bg-surface-1 px-2 py-1 text-[11px] text-fg-muted transition hover:border-accent hover:text-accent disabled:opacity-50"
            >
              <Undo2 className="h-3 w-3" />
              {undoing ? "Undoing…" : "Undo last edit"}
            </button>
          </div>
          <ul className="space-y-2">
            {lessons.slice(0, 8).map((l, idx) => (
              <li
                key={l.id}
                className={
                  "rounded-md border border-divider bg-surface-1 p-2 text-xs " +
                  (idx === 0 ? "ring-1 ring-accent/30" : "")
                }
              >
                <p className="text-fg">{l.instruction}</p>
                <p className="mt-0.5 text-[10px] italic text-fg-muted">
                  → rule: {l.summary}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
