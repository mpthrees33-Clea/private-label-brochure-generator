"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Product } from "@/lib/store/types";
import type { BrochureSize, TechSpecs } from "@/lib/brochure-types";
import { parseSizeLabel, sizeAvailable, sizeChartLabel } from "@/lib/scrapers/size-format";

export function EditProductForm({ product }: { product: Product }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [trinityName, setTrinityName] = useState(product.trinityName);
  const [trinityTagline, setTrinityTagline] = useState(product.trinityTagline);
  const [description, setDescription] = useState(product.description);
  const [heroImageUrl, setHeroImageUrl] = useState(product.heroImageUrl);
  const [colors, setColors] = useState(product.colors);
  const [sizes, setSizes] = useState<BrochureSize[]>(product.sizes);
  const [techSpecs, setTechSpecs] = useState<Partial<TechSpecs>>(product.techSpecs ?? {});
  const [checked, setChecked] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const color of product.colors) {
      const avail =
        product.availability[color.trinityName] ??
        product.availability[color.trinityName.toLowerCase()] ??
        [];
      product.sizes.forEach((size, si) => {
        initial[cellKey(color.trinityName, si)] = sizeAvailable(size, avail);
      });
    }
    return initial;
  });

  function updateSize(i: number, patch: Partial<BrochureSize>) {
    setSizes((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }

  function removeSize(i: number) {
    setSizes((prev) => prev.filter((_, idx) => idx !== i));
    setChecked((prev) => {
      const next: Record<string, boolean> = {};
      for (const [key, value] of Object.entries(prev)) {
        const [color, indexRaw] = key.split("::");
        const index = Number(indexRaw);
        if (index === i) continue;
        const shifted = index > i ? index - 1 : index;
        next[cellKey(color, shifted)] = value;
      }
      return next;
    });
  }

  function updateColor(i: number, patch: Partial<(typeof colors)[0]>) {
    setColors((cs) =>
      cs.map((c, idx) => (idx === i ? { ...c, ...patch } : c)),
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const normalizedSizes = sizes.map((s) => {
      const parsed = s.label ? parseSizeLabel(`${s.label}${s.isDeco ? " deco" : ""}`) : null;
      return {
        ...s,
        label: parsed?.label ?? s.label,
        iconKind: parsed?.iconKind ?? s.iconKind,
        isDeco: parsed ? parsed.isDeco || undefined : s.isDeco,
        thickness: s.thickness?.trim() ? s.thickness.trim() : null,
      };
    });
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
        sizes: normalizedSizes,
        availability: Object.fromEntries(
          colors.map((c) => {
            const name = c.trinityName.toLowerCase();
            const labels = normalizedSizes
              .map((s, si) =>
                checked[cellKey(c.trinityName, si)] ? sizeChartLabel(s) : null,
              )
              .filter((v): v is string => !!v);
            return [name, labels];
          }),
        ),
        techSpecs,
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
            product.factoryUrl ? (
              <a
                href={product.factoryUrl}
                target="_blank"
                rel="noreferrer"
                className="text-accent hover:underline"
              >
                {product.factoryUrl}
              </a>
            ) : (
              <span className="text-fg-faint">PDF upload (no URL)</span>
            )
          }
        />
        <Read
          label="Finish legend"
          value={product.finishLegend.join(", ") || "—"}
        />

        <div>
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-fg-muted">
            Sizes
          </h3>
          <div className="space-y-2">
            {sizes.map((s, i) => (
              <div key={i} className="grid grid-cols-[1fr_5rem_auto_auto] items-center gap-2">
                <input
                  value={s.label}
                  onChange={(e) => updateSize(i, { label: e.target.value })}
                  className="input"
                  placeholder='12"x24"'
                />
                <input
                  value={s.thickness ?? ""}
                  onChange={(e) => updateSize(i, { thickness: e.target.value })}
                  className="input"
                  placeholder="8mm"
                />
                <label className="flex items-center gap-1 text-[10px] text-fg-muted">
                  <input
                    type="checkbox"
                    checked={!!s.isDeco}
                    onChange={(e) => updateSize(i, { isDeco: e.target.checked })}
                  />
                  deco
                </label>
                <button
                  type="button"
                  className="text-[10px] text-fg-faint hover:text-danger"
                  onClick={() => removeSize(i)}
                >
                  remove
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            className="mt-2 text-xs text-accent hover:underline"
            onClick={() =>
              setSizes((prev) => [
                ...prev,
                { label: "", iconKind: "rectangle" },
              ])
            }
          >
            Add size
          </button>
        </div>

        {colors.length > 0 && sizes.length > 0 && (
          <div>
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-fg-muted">
              Which colors come in which sizes
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[10px]">
                <thead>
                  <tr>
                    <th />
                    {sizes.map((s, i) => (
                      <th key={i} className="px-1 pb-1 font-normal text-fg-muted">
                        {sizeChartLabel(s) || "—"}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {colors.map((c) => (
                    <tr key={c.trinityName}>
                      <td className="py-0.5 pr-2 text-fg">{c.trinityName}</td>
                      {sizes.map((_, si) => (
                        <td key={si} className="py-0.5 text-center">
                          <input
                            type="checkbox"
                            checked={!!checked[cellKey(c.trinityName, si)]}
                            onChange={(e) =>
                              setChecked((prev) => ({
                                ...prev,
                                [cellKey(c.trinityName, si)]: e.target.checked,
                              }))
                            }
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div>
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-fg-muted">
            Tech specs
          </h3>
          <div className="space-y-2">
            {SPEC_FIELDS.map((field) => (
              <label key={field.key} className="block">
                <span className="mb-1 block text-[10px] uppercase tracking-wide text-fg-faint">
                  {field.label}
                </span>
                <input
                  value={techSpecs[field.key] ?? ""}
                  onChange={(e) =>
                    setTechSpecs((prev) => ({
                      ...prev,
                      [field.key]: e.target.value,
                    }))
                  }
                  className="input"
                />
              </label>
            ))}
          </div>
        </div>
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

const SPEC_FIELDS: { key: keyof TechSpecs; label: string }[] = [
  { key: "thickness", label: "thickness" },
  { key: "shadeVariation", label: "shade variation" },
  { key: "waterAbsorption", label: "water absorption" },
  { key: "frostResistance", label: "frost resistance" },
  { key: "stainResistance", label: "stain resistance" },
  { key: "chemicalResistance", label: "chemical resistance" },
  { key: "scratchHardness", label: "scratch hardness" },
  { key: "breakingStrength", label: "breaking strength" },
  { key: "dcof", label: "DCOF" },
];

function cellKey(color: string, sizeIndex: number): string {
  return `${color.toLowerCase()}::${sizeIndex}`;
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
