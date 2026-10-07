"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Image as ImageIcon,
  ChevronDown,
  ChevronRight,
  Camera,
  Loader2,
} from "lucide-react";
import { proxyImageUrl } from "@/lib/image-proxy";
import { recordLesson } from "@/lib/record-lesson";

// Paste-URL editor for the page-1 hero image. Auto-opens when the hero
// is missing (parallel to SwatchImageEditor's missing-on-open behavior).
// The hero is the single biggest visual element on the brochure; reps
// hit "scrape gave the wrong hero" often enough that this needs to be
// one click + one paste from anywhere on the product page.
export function HeroImageEditor({
  productId,
  currentUrl,
}: {
  productId: string;
  currentUrl: string;
}) {
  const router = useRouter();
  const missing = !currentUrl || !currentUrl.trim();
  const [open, setOpen] = useState(missing);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const saveUrl = useCallback(
    async (value: string) => {
      setBusy(true);
      setError(null);
      const wasEmpty = !currentUrl || !currentUrl.trim();
      try {
        const res = await fetch(`/api/products/${productId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ heroImageUrl: value }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => null);
          throw new Error(j?.error ?? `HTTP ${res.status}`);
        }
        // If the scraper had given up on the hero (empty), record a
        // lesson so the next scrape of this factory tries harder.
        if (wasEmpty) {
          recordLesson(productId, {
            kind: "image-fix",
            field: "heroImageUrl",
            before: "",
            after: value,
          });
        }
        setDraft("");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Save failed.");
        throw err;
      } finally {
        setBusy(false);
      }
    },
    [productId, currentUrl, router],
  );

  async function save() {
    const value = draft.trim();
    if (!value) return;
    try {
      await saveUrl(value);
    } catch {
      /* error already set */
    }
  }

  // Upload a binary image and save its URL as the hero. Used by the
  // photo picker (camera/upload button) and the input's paste handler
  // — the iOS workflow where reps can't easily extract a URL.
  const uploadFile = useCallback(
    async (file: File) => {
      if (!file.type || !file.type.startsWith("image/")) {
        setError(`not an image (${file.type || "unknown type"})`);
        return;
      }
      setUploading(true);
      setError(null);
      try {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch("/api/uploads", { method: "POST", body: form });
        const j = await res
          .json()
          .catch(() => ({ ok: false, error: "bad response" }));
        if (!j.ok || !j.url) throw new Error(j.error ?? `HTTP ${res.status}`);
        await saveUrl(j.url);
      } catch (err) {
        setError(err instanceof Error ? err.message : "upload failed");
      } finally {
        setUploading(false);
      }
    },
    [saveUrl],
  );

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === "file" && item.type.startsWith("image/")) {
        const f = item.getAsFile();
        if (f) {
          e.preventDefault();
          void uploadFile(f);
          return;
        }
      }
    }
  }

  return (
    <div className="mb-4 rounded-md border border-divider bg-surface text-xs">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition hover:bg-surface-1"
      >
        <span className="flex items-center gap-2 text-fg">
          <ImageIcon className="h-4 w-4 text-accent" />
          <span className="font-semibold">hero image</span>
          {missing && (
            <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-[10px] font-semibold text-red-300">
              missing
            </span>
          )}
        </span>
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </button>
      {open && (
        <div className="border-t border-divider px-3 py-3">
          <p className="mb-3 text-[11px] text-fg-muted">
            Big lifestyle / room-scene image at the top of page 1. Paste a URL, paste an image, or tap the <Camera className="inline h-3 w-3 align-[-1px]" /> icon to upload from your photos. The on-page brochure preview lets you nudge its vertical position by clicking and dragging.
          </p>
          <div className="flex items-center gap-2">
            <div className="h-12 w-16 shrink-0 overflow-hidden rounded-xs border border-divider bg-[#f3f3f3]">
              {!missing ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={proxyImageUrl(currentUrl)}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : null}
            </div>
            <input
              type="url"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onPaste={handlePaste}
              placeholder={missing ? "paste hero URL or image" : "replace URL…"}
              disabled={busy || uploading}
              onKeyDown={(e) => {
                if (e.key === "Enter") save();
              }}
              className="min-w-0 flex-1 rounded-md border border-divider bg-surface px-2 py-1 text-[11px] text-fg focus:border-accent focus:outline-hidden"
            />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void uploadFile(f);
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={busy || uploading}
              title="upload from photos / camera"
              aria-label="upload hero from photos"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-divider bg-surface text-fg-muted transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
            >
              {uploading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Camera className="h-3.5 w-3.5" />
              )}
            </button>
            <button
              type="button"
              onClick={save}
              disabled={busy || uploading || !draft.trim()}
              className="rounded-md bg-accent px-2 py-1 text-[11px] font-semibold text-white shadow-glow-accent transition hover:bg-accent-light disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy && !uploading ? "…" : "save"}
            </button>
          </div>
          {error && <p className="mt-2 text-xs text-danger">{error}</p>}
        </div>
      )}
    </div>
  );
}
