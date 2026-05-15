import { SEED_PRODUCTS } from "./seed";
import { readJsonStore, writeJsonStore } from "./blob-storage";
import type { Product } from "./types";

// Products are stored as a single JSON blob ("store/products.json").
// Vercel Blob in prod, /tmp file locally. The store is read on every
// request — no long-lived in-memory cache — so a save on instance A is
// immediately visible from instance B. Necessary to fix the "404 after
// save" bug where the redirected GET landed on a different instance
// than the POST that created the product.
const PATHNAME = "store/products.json";

async function load(): Promise<Product[]> {
  const products = await readJsonStore<Product[] | null>(PATHNAME, null);
  if (products && products.length > 0) {
    // Top-up: add any newly-introduced seed products that aren't yet
    // persisted. Existing rep-edited rows are preserved. Persistence
    // is best-effort — if storage isn't configured we still return the
    // merged list so the dashboard isn't broken, the writeJsonStore
    // failure is what surfaces the misconfiguration on actual saves.
    const existingIds = new Set(products.map((p) => p.id));
    const missingSeeds = SEED_PRODUCTS.filter((p) => !existingIds.has(p.id));
    if (missingSeeds.length > 0) {
      const merged = [...products, ...missingSeeds];
      writeJsonStore(PATHNAME, merged).catch(() => {});
      return merged;
    }
    return products;
  }
  // First run — seed. Persist best-effort.
  const seeded = [...SEED_PRODUCTS];
  writeJsonStore(PATHNAME, seeded).catch(() => {});
  return seeded;
}

async function save(all: Product[]): Promise<void> {
  await writeJsonStore(PATHNAME, all);
}

export async function listProducts(): Promise<Product[]> {
  const all = await load();
  return [...all].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getProduct(id: string): Promise<Product | null> {
  const all = await load();
  return all.find((p) => p.id === id) ?? null;
}

// Strip protocol, www, trailing slash, fragment, and tracking params so
// e.g. https://www.foo.com/x/ and http://foo.com/x?utm_source=bar match.
export function normalizeFactoryUrl(raw: string): string {
  try {
    const u = new URL(raw);
    const host = u.hostname.replace(/^www\./, "").toLowerCase();
    const path = u.pathname.replace(/\/+$/, "") || "/";
    const params = new URLSearchParams();
    u.searchParams.forEach((v, k) => {
      if (!k.toLowerCase().startsWith("utm_") && k.toLowerCase() !== "fbclid") {
        params.append(k, v);
      }
    });
    const qs = params.toString();
    return `${host}${path}${qs ? `?${qs}` : ""}`;
  } catch {
    return raw.trim().toLowerCase();
  }
}

export async function findByFactoryUrl(url: string): Promise<Product | null> {
  const target = normalizeFactoryUrl(url);
  const all = await load();
  return all.find((p) => normalizeFactoryUrl(p.factoryUrl) === target) ?? null;
}

export async function createProduct(
  input: Omit<Product, "id" | "createdAt" | "updatedAt">,
): Promise<Product> {
  const all = await load();
  const now = new Date().toISOString();
  const product: Product = {
    ...input,
    id: randomId(),
    createdAt: now,
    updatedAt: now,
  };
  all.push(product);
  await save(all);
  return product;
}

export async function updateProduct(
  id: string,
  patch: Partial<Omit<Product, "id" | "createdAt">>,
): Promise<Product> {
  const all = await load();
  const idx = all.findIndex((p) => p.id === id);
  if (idx < 0) throw new Error(`Product ${id} not found`);
  const updated: Product = {
    ...all[idx],
    ...patch,
    id,
    createdAt: all[idx].createdAt,
    updatedAt: new Date().toISOString(),
  };
  all[idx] = updated;
  await save(all);
  return updated;
}

export async function deleteProduct(id: string): Promise<void> {
  const all = await load();
  const remaining = all.filter((p) => p.id !== id);
  await save(remaining);
}

function randomId(): string {
  return (
    Math.random().toString(36).slice(2, 10) +
    Date.now().toString(36)
  );
}
