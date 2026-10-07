"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Image as ImageIcon,
  ChevronDown,
  ChevronRight,
  Sparkles,
  Camera,
  Loader2,
} from "lucide-react";
import type { BrochureColor } from "@/lib/brochure-types";
import { facePhotoMismatch } from "@/lib/swatch-geometry";
import { proxyImageUrl } from "@/lib/image-proxy";
import {
  detectSwatchPattern,
  applyPattern,
  type SwatchPattern,
} from "@/lib/swatch-pattern";
import { recordLesson } from "@/lib/record-lesson";

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
  const [autoFilling, setAutoFilling] = useState<"imageUrl" | "decoImageUrl" | null>(null);

  function setDraft(key: string, value: string) {
    setDrafts((d) => ({ ...d, [key]: value }));
  }

  // Pattern detection runs on every render against the CURRENT saved
  // colors (not the drafts) — the rep has to actually save before we
  // generalize, since pasting a typo into the input shouldn't poison
  // the pattern across the other rows.
  const mainPattern = useMemo<SwatchPattern | null>(
    () =>
      detectSwatchPattern(
        colors
          .filter((c) => c.imageUrl && c.imageUrl.trim())
          .map((c) => ({ colorName: c.trinityName, url: c.imageUrl })),
      ),
    [colors],
  );
  const decoPattern = useMemo<SwatchPattern | null>(
    () =>
      detectSwatchPattern(
        colors
          .filter((c) => c.decoImageUrl && c.decoImageUrl.trim())
          .map((c) => ({ colorName: c.trinityName, url: c.decoImageUrl! })),
      ),
    [colors],
  );

  const mainMissing = colors
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => !c.imageUrl || !c.imageUrl.trim());
  const decoMissing = colors
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => !c.decoImageUrl || !c.decoImageUrl.trim());

  // Filled counts feed the "no pattern detected" banner — we only tell
  // the rep no pattern was found AFTER they've given us enough examples
  // to actually generalize from.
  const mainFilled = colors.length - mainMissing.length;
  const decoFilled = colors.length - decoMissing.length;

  // Auto-fill every still-missing swatch using the detected pattern.
  // We HEAD-check each candidate URL before committing — if even one
  // doesn't return an image, we bail and surface that to the rep
  // rather than silently saving a 404.
  const autoFill = useCallback(
    async (
      field: "imageUrl" | "decoImageUrl",
      pattern: SwatchPattern,
      targets: { c: BrochureColor; i: number }[],
    ) => {
      if (targets.length === 0) return;
      setAutoFilling(field);
      setError(null);
      try {
        const candidates = targets.map(({ c, i }) => ({
          idx: i,
          colorName: c.trinityName,
          url: applyPattern(pattern, c.trinityName),
        }));
        const checks = await Promise.all(
          candidates.map(async (cand) => {
            const res = await fetch(
              `/api/swatch-suggest?url=${encodeURIComponent(cand.url)}`,
            );
            const j = await res.json().catch(() => ({ ok: false }));
            return { ...cand, ok: !!j.ok, reason: j.reason as string | undefined };
          }),
        );
        const bad = checks.filter((c) => !c.ok);
        if (bad.length > 0) {
          setError(
            `Pattern didn't fit for ${bad.length} color(s): ${bad.map((b) => `${b.colorName} (${b.reason ?? "404"})`).join(", ")}. Fill those manually.`,
          );
        }
        const ok = checks.filter((c) => c.ok);
        if (ok.length === 0) return;
        const nextColors = colors.map((c, i) => {
          const hit = ok.find((o) => o.idx === i);
          return hit ? { ...c, [field]: hit.url } : c;
        });
        const res = await fetch(`/api/products/${productId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ colors: nextColors }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => null);
          throw new Error(j?.error ?? `HTTP ${res.status}`);
        }
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Auto-fill failed.");
      } finally {
        setAutoFilling(null);
      }
    },
    [colors, productId, router],
  );

  // Auto-trigger autoFill the moment a viable pattern emerges. The ref
  // keys are "patternKey + field" so we don't loop: each unique pattern
  // is only auto-filled once, even if the parent re-renders. If the rep
  // adds another correctly-patterned URL later, the pattern key changes
  // and we re-trigger for any new gaps.
  const autoFilledRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!mainPattern || mainMissing.length === 0) return;
    const key = `imageUrl|${mainPattern.prefix}|${mainPattern.suffix}|${mainPattern.normalizationId}`;
    if (autoFilledRef.current.has(key)) return;
    autoFilledRef.current.add(key);
    void autoFill("imageUrl", mainPattern, mainMissing);
  }, [mainPattern, mainMissing, autoFill]);
  useEffect(() => {
    if (!decoPattern || decoMissing.length === 0) return;
    const key = `decoImageUrl|${decoPattern.prefix}|${decoPattern.suffix}|${decoPattern.normalizationId}`;
    if (autoFilledRef.current.has(key)) return;
    autoFilledRef.current.add(key);
    void autoFill("decoImageUrl", decoPattern, decoMissing);
  }, [decoPattern, decoMissing, autoFill]);

  // Lower-level save: writes `value` to a single color's field, ignoring
  // any draft state. Used both by the URL-input save flow (after reading
  // the draft) and by the file-upload flow (where the URL comes back
  // from /api/uploads, not from user typing).
  async function saveColorValue(
    idx: number,
    field: "imageUrl" | "decoImageUrl",
    value: string,
  ) {
    const key = `${idx}:${field}`;
    if (!value) return;
    const prev = colors[idx]?.[field] ?? "";
    const wasEmpty = !prev || (typeof prev === "string" && prev.trim() === "");
    const colorName = colors[idx]?.trinityName;
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
      if (wasEmpty) {
        recordLesson(productId, {
          kind: "image-fix",
          field,
          colorName,
          before: "",
          after: value,
        });
      }
      setDrafts((d) => {
        const copy = { ...d };
        delete copy[key];
        return copy;
      });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
      throw err;
    } finally {
      setBusy((b) => {
        const copy = { ...b };
        delete copy[key];
        return copy;
      });
    }
  }

  async function saveColor(idx: number, field: "imageUrl" | "decoImageUrl") {
    const key = `${idx}:${field}`;
    const value = (drafts[key] ?? "").trim();
    if (!value) return;
    try {
      await saveColorValue(idx, field, value);
    } catch {
      // saveColorValue already surfaced the error to the user
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
            Paste a URL, paste an image, or tap the <Camera className="inline h-3 w-3 align-[-1px]" /> icon to upload from your photos. Use the deco field for the textured / deco variant if applicable.
          </p>
          <PatternBanner
            label="main swatches"
            pattern={mainPattern}
            filledCount={mainFilled}
            missingCount={mainMissing.length}
            busy={autoFilling === "imageUrl"}
            onFill={() => mainPattern && autoFill("imageUrl", mainPattern, mainMissing)}
          />
          <PatternBanner
            label="deco swatches"
            pattern={decoPattern}
            filledCount={decoFilled}
            missingCount={decoMissing.length}
            busy={autoFilling === "decoImageUrl"}
            onFill={() => decoPattern && autoFill("decoImageUrl", decoPattern, decoMissing)}
          />
          <ul className="space-y-3">
            {colors.map((c, idx) => (
              <li key={idx} className="rounded-md border border-divider bg-surface-1 p-2">
                <div className="mb-2 flex items-center gap-2">
                  <span className="text-[11px] uppercase tracking-wider text-fg-faint">color</span>
                  <span className="font-semibold lowercase text-fg">{c.trinityName}</span>
                  {(c.faces ?? []).some(
                    (face) =>
                      face.sizeUnknown ||
                      (!(face.aspectRatio && face.aspectRatio > 0) && !(face.widthIn && face.heightIn)),
                  ) && (
                      <span className="text-[11px] font-medium text-amber-700">size unknown</span>
                    )}
                  {(c.faces ?? []).some((face) => facePhotoMismatch(face)) && (
                    <span className="text-[11px] font-medium text-amber-700">
                      photo shape doesn&apos;t match tile size
                    </span>
                  )}
                </div>
                <SwatchRow
                  label="main swatch"
                  current={c.imageUrl}
                  draft={drafts[`${idx}:imageUrl`]}
                  busy={!!busy[`${idx}:imageUrl`]}
                  onChange={(v) => setDraft(`${idx}:imageUrl`, v)}
                  onSave={() => saveColor(idx, "imageUrl")}
                  onSaveValue={(v) => saveColorValue(idx, "imageUrl", v)}
                />
                <SwatchRow
                  label="deco / textured (optional)"
                  current={c.decoImageUrl ?? ""}
                  draft={drafts[`${idx}:decoImageUrl`]}
                  busy={!!busy[`${idx}:decoImageUrl`]}
                  onChange={(v) => setDraft(`${idx}:decoImageUrl`, v)}
                  onSave={() => saveColor(idx, "decoImageUrl")}
                  onSaveValue={(v) => saveColorValue(idx, "decoImageUrl", v)}
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

// Three states this banner can show:
//   1. <2 saved swatches in this set → hidden (need more examples to generalize)
//   2. ≥2 saved AND missing > 0 AND pattern detected → "auto-filling…" / "fill N remaining"
//   3. ≥2 saved AND missing > 0 AND NO pattern detected → "no pattern" warning
// Hidden when missing = 0 (nothing left to fill).
function PatternBanner({
  label,
  pattern,
  filledCount,
  missingCount,
  busy,
  onFill,
}: {
  label: string;
  pattern: SwatchPattern | null;
  filledCount: number;
  missingCount: number;
  busy: boolean;
  onFill: () => void;
}) {
  if (missingCount === 0) return null;
  if (filledCount < 2) return null;

  // No-pattern state: 2+ filled, missing > 0, but URLs don't share a
  // generalizable shape. Tell the rep why auto-fill isn't running.
  if (!pattern) {
    return (
      <div className="mb-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px] text-fg">
        <div className="flex items-center gap-1.5 font-semibold text-amber-300">
          <Sparkles className="h-3.5 w-3.5" />
          no URL pattern detected for {label}
        </div>
        <div className="mt-0.5 text-[11px] text-fg-muted">
          The {filledCount} saved URL{filledCount === 1 ? "" : "s"} don&apos;t share a recognizable color-name pattern, so the remaining {missingCount} can&apos;t be auto-filled. Paste them manually below.
        </div>
      </div>
    );
  }

  // Detected state: show pattern preview + manual re-fill button (the
  // useEffect auto-triggers, but the button is useful if the rep clears
  // a swatch later and wants to re-fill it).
  const previewPrefix =
    pattern.prefix.length > 28 ? "…" + pattern.prefix.slice(-26) : pattern.prefix;
  const previewSuffix =
    pattern.suffix.length > 24 ? pattern.suffix.slice(0, 22) + "…" : pattern.suffix;
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-accent/40 bg-accent/10 px-3 py-2 text-[11px] text-fg">
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 font-semibold text-accent">
          <Sparkles className="h-3.5 w-3.5" />
          {busy ? `auto-filling ${label}…` : `pattern detected for ${label}`}
        </div>
        <div
          className="mt-0.5 truncate font-mono text-[10px] text-fg-muted"
          title={`${pattern.prefix}<color>${pattern.suffix}`}
        >
          {previewPrefix}
          <span className="bg-accent/30 px-0.5 text-accent">&lt;color&gt;</span>
          {previewSuffix}
        </div>
      </div>
      <button
        type="button"
        onClick={onFill}
        disabled={busy}
        className="shrink-0 rounded-md bg-accent px-3 py-1 text-[11px] font-semibold text-white shadow-glow-accent transition hover:bg-accent-light disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? "checking…" : `fill ${missingCount} remaining`}
      </button>
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
  onSaveValue,
}: {
  label: string;
  current: string;
  // `undefined` ⇒ no edits in progress, show the saved URL as the
  // visible value so the rep can see which fields are populated.
  // `string` ⇒ the rep is actively editing; show what they typed.
  draft: string | undefined;
  busy: boolean;
  onChange: (v: string) => void;
  onSave: () => void;
  // Save a value directly without going through the draft state. Used
  // by the upload flow — the URL comes back from /api/uploads, not
  // from the rep typing.
  onSaveValue: (url: string) => Promise<void>;
}) {
  const hasCurrent = !!(current && current.trim());
  const value = draft !== undefined ? draft : current;
  // Save is enabled only when the input actually differs from what's
  // already saved — clicking "save" with no changes is a no-op anyway.
  const isDirty = draft !== undefined && draft !== current;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const uploadFile = useCallback(
    async (file: File) => {
      if (!file.type || !file.type.startsWith("image/")) {
        setUploadError(`not an image (${file.type || "unknown type"})`);
        return;
      }
      setUploading(true);
      setUploadError(null);
      try {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch("/api/uploads", {
          method: "POST",
          body: form,
        });
        const j = await res
          .json()
          .catch(() => ({ ok: false, error: "bad response" }));
        if (!j.ok || !j.url) {
          throw new Error(j.error ?? `HTTP ${res.status}`);
        }
        await onSaveValue(j.url);
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : "upload failed");
      } finally {
        setUploading(false);
      }
    },
    [onSaveValue],
  );

  // Paste handler: if the clipboard contains an image (iOS long-press
  // → Copy on an image, then Paste here), upload it instead of pasting
  // the raw bytes as text. If the clipboard has no image (just a URL),
  // fall through to the normal paste behavior.
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

  const disabled = busy || uploading;

  return (
    <div className="mt-1.5">
      <div className="flex items-center gap-2">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xs border border-divider bg-[#f3f3f3]">
          {hasCurrent ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={proxyImageUrl(current)}
              alt=""
              className="max-h-full max-w-full object-contain"
            />
          ) : (
            <span className="px-0.5 text-center text-[8px] uppercase leading-tight text-fg-faint">
              no photo
            </span>
          )}
        </div>
        <input
          type="url"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onPaste={handlePaste}
          placeholder={hasCurrent ? "" : `paste ${label} URL or image`}
          disabled={disabled}
          onKeyDown={(e) => {
            if (e.key === "Enter") onSave();
          }}
          className={`min-w-0 flex-1 rounded-md border bg-surface px-2 py-1 text-[11px] text-fg focus:border-accent focus:outline-hidden ${
            hasCurrent && !isDirty ? "border-divider text-fg-muted" : "border-divider"
          }`}
          title={value}
        />
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            // Reset the input so picking the same file twice still fires.
            e.target.value = "";
            if (f) void uploadFile(f);
          }}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled}
          title="upload from photos / camera"
          aria-label={`upload ${label} from photos`}
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
          onClick={onSave}
          disabled={disabled || !isDirty || !value.trim()}
          className="rounded-md bg-accent px-2 py-1 text-[11px] font-semibold text-white shadow-glow-accent transition hover:bg-accent-light disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy && !uploading ? "…" : "save"}
        </button>
      </div>
      {uploadError && (
        <p className="ml-7 mt-1 text-[10px] text-danger">{uploadError}</p>
      )}
    </div>
  );
}
