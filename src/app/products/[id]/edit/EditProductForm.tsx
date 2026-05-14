"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Product } from "@/lib/store/types";

export function EditProductForm({ product }: { product: Product }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [trinityName, setTrinityName] = useState(product.trinityName);
  const [trinityTagline, setTrinityTagline] = useState(product.trinityTagline);
  const [description, setDescription] = useState(product.description);
  const [heroImageUrl, setHeroImageUrl] = useState(product.heroImageUrl);
  const [colors, setColors] = useState(product.colors);

  function updateColor(i: number, patch: Partial<(typeof colors)[0]>) {
    setColors((cs) =>
      cs.map((c, idx) => (idx === i ? { ...c, ...patch } : c)),
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/products/${product.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        trinityName: trinityName.toLowerCase(),
        trinityTagline,
        description,
        heroImageUrl,
        colors: colors.map((c) => ({
          ...c,
          trinityName: c.trinityName.toLowerCase(),
        })),
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const j = await res.json().catch(() => null);
      setError(j?.error ?? "Save failed.");
      return;
    }
    router.push(`/products/${product.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-8 md:grid-cols-2">
      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-fg-muted">
          Trinity branding
        </h2>

        <Field label="Trinity collection name">
          <input
            value={trinityName}
            onChange={(e) => setTrinityName(e.target.value)}
            className="input lowercase"
          />
        </Field>

        <Field label="Tagline">
          <input
            value={trinityTagline}
            onChange={(e) => setTrinityTagline(e.target.value)}
            className="input"
          />
        </Field>

        <Field label="Description">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            className="input"
          />
        </Field>

        <Field label="Hero image URL">
          <input
            type="url"
            value={heroImageUrl}
            onChange={(e) => setHeroImageUrl(e.target.value)}
            className="input"
          />
        </Field>

        <div>
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-fg-muted">
            Colors
          </h3>
          <div className="space-y-2">
            {colors.map((c, i) => (
              <div
                key={i}
                className="grid grid-cols-[80px_1fr] items-center gap-3 rounded-md border border-divider bg-surface p-2"
              >
                {c.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={c.imageUrl}
                    alt={c.trinityName}
                    className="h-20 w-10 rounded object-cover"
                  />
                ) : (
                  <div className="h-20 w-10 rounded bg-surface-1" />
                )}
                <div>
                  <input
                    value={c.trinityName}
                    onChange={(e) =>
                      updateColor(i, { trinityName: e.target.value })
                    }
                    className="input lowercase"
                    placeholder="Trinity color name"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {error && (
          <p className="text-sm text-danger">{error}</p>
        )}

        <div className="flex items-center gap-2 pt-2">
          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white shadow-glow-accent transition hover:bg-accent-light disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
          <Link
            href={`/products/${product.id}`}
            className="text-sm text-fg-muted hover:text-accent"
          >
            Cancel
          </Link>
        </div>
      </section>

      <aside className="space-y-3 rounded-md border border-divider bg-surface p-4 text-xs">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-fg-muted">
          Scraped factory data
        </h2>
        <Read label="Factory" value={product.factory} />
        <Read label="Factory product" value={product.factoryName} />
        <Read
          label="Source"
          value={
            <a
              href={product.factoryUrl}
              target="_blank"
              rel="noreferrer"
              className="text-accent hover:underline"
            >
              {product.factoryUrl}
            </a>
          }
        />
        <Read
          label="Sizes"
          value={product.sizes.map((s) => s.label).join(", ") || "—"}
        />
        <Read
          label="Finish legend"
          value={product.finishLegend.join(", ") || "—"}
        />
        <Read
          label="Tech specs"
          value={
            <pre className="whitespace-pre-wrap text-[10px] text-fg-muted">
              {JSON.stringify(product.techSpecs, null, 2)}
            </pre>
          }
        />
        <p className="pt-2 text-[10px] text-fg-faint">
          Sizes, availability matrix, and tech specs are editable via the API
          (PATCH /api/products/[id]) but not yet exposed in this form. Tomorrow.
        </p>
      </aside>

      <style jsx>{`
        :global(.input) {
          width: 100%;
          border-radius: 0.375rem;
          border: 1px solid #222e3f;
          background-color: #161e2a;
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
          color: #f5f9ff;
        }
        :global(.input:focus) {
          outline: none;
          border-color: #177aa9;
        }
      `}</style>
    </form>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-fg-muted">
        {label}
      </span>
      {children}
    </label>
  );
}

function Read({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-fg-faint">
        {label}
      </div>
      <div className="text-fg">{value}</div>
    </div>
  );
}
