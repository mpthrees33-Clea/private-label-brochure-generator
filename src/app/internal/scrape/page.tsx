"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { FileUp, Link2 } from "lucide-react";
import { FACTORIES } from "@/lib/factories";

type Mode = "url" | "pdf";

export default function ScrapeFormPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("url");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (mode === "url") {
      if (!url) return;
      setLoading(true);
      router.push(`/internal/brochure/scrape?url=${encodeURIComponent(url)}`);
      return;
    }
    // PDF mode
    if (!file) return;
    setLoading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/scrape/pdf", { method: "POST", body: form });
      const json = (await res.json().catch(() => null)) as
        | { id?: string; error?: string }
        | null;
      if (!res.ok || !json?.id) {
        throw new Error(json?.error ?? `HTTP ${res.status}`);
      }
      router.push(`/products/${json.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
      setLoading(false);
    }
  }

  const submitDisabled =
    loading || (mode === "url" ? !url : !file);
  const submitLabel = loading
    ? mode === "url"
      ? "Scraping…"
      : "Reading PDF…"
    : "Private-label it";

  return (
    <main className="mx-auto max-w-2xl px-6 py-10 text-fg">
      <h1 className="font-brand text-3xl font-extrabold tracking-tight">
        private label this collection
      </h1>
      <p className="mt-2 text-sm text-fg-muted">
        Paste a factory product page URL — or upload a factory PDF spec
        sheet for unreleased products that don&rsquo;t have a public URL
        yet. Claude extracts colors, sizes, and tech specs, then renders
        a Trinity-branded brochure.
      </p>

      <div className="mt-6 inline-flex rounded-md border border-divider bg-surface p-0.5 text-sm">
        <button
          type="button"
          onClick={() => setMode("url")}
          className={`flex items-center gap-1.5 rounded px-3 py-1.5 font-medium transition ${
            mode === "url"
              ? "bg-accent text-white shadow-glow-accent"
              : "text-fg-muted hover:text-fg"
          }`}
        >
          <Link2 className="h-3.5 w-3.5" />
          Paste URL
        </button>
        <button
          type="button"
          onClick={() => setMode("pdf")}
          className={`flex items-center gap-1.5 rounded px-3 py-1.5 font-medium transition ${
            mode === "pdf"
              ? "bg-accent text-white shadow-glow-accent"
              : "text-fg-muted hover:text-fg"
          }`}
        >
          <FileUp className="h-3.5 w-3.5" />
          Upload PDF
        </button>
      </div>

      <form onSubmit={onSubmit} className="mt-5 space-y-3">
        {mode === "url" ? (
          <label className="block text-sm font-medium">
            Factory product URL
            <input
              type="url"
              required
              autoFocus
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.ragnousa.com/collections/forum-series/"
              className="mt-1 w-full rounded-md border border-divider bg-surface-1 px-3 py-2 text-sm focus:border-accent focus:outline-none"
            />
          </label>
        ) : (
          <div className="block text-sm font-medium">
            Factory PDF (spec sheet, brochure, or product sheet)
            <div className="mt-1 flex items-center gap-3">
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf,.pdf"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="rounded-md border border-divider bg-surface-1 px-3 py-2 text-sm font-medium transition hover:border-accent"
              >
                Choose PDF…
              </button>
              <span className="truncate text-xs text-fg-muted">
                {file
                  ? `${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`
                  : "No file chosen"}
              </span>
            </div>
            <p className="mt-2 text-xs text-fg-faint">
              Max 32 MB. Image URLs aren&rsquo;t in the PDF — you&rsquo;ll
              paste swatch and hero images on the next page.
            </p>
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={submitDisabled}
            className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white shadow-glow-accent transition hover:bg-accent-light disabled:opacity-60"
          >
            {submitLabel}
          </button>
          {error && <span className="text-xs text-danger">{error}</span>}
        </div>
        <p className="text-xs text-fg-faint">
          Extraction usually takes 1–2 minutes. You&rsquo;ll see progress on
          the next screen, and a specific error if the page can&rsquo;t be read.
        </p>
      </form>

      <section className="mt-12">
        <h2 className="text-sm font-semibold text-fg-muted">
          Supported factories
        </h2>
        <ul className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-sm text-fg-muted">
          {FACTORIES.map((f) => (
            <li key={f.display}>
              <span className="text-fg">{f.display}</span>{" "}
              <span className="text-fg-faint">— {f.domains[0]}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-fg-faint">
          Unknown factories work too — Claude reads whatever HTML the
          page returns. If a factory site is heavily JS-rendered, scrape
          may come back partial; we&rsquo;ll add a per-factory adapter
          for those after launch.
        </p>
      </section>

      <p className="mt-12 text-xs text-fg-faint">
        <Link href="/internal/brochure/preview" className="hover:text-accent">
          → see the hard-coded Kendall preview instead
        </Link>
      </p>
    </main>
  );
}
