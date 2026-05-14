import { promises as fs } from "fs";
import path from "path";
import { SEED_PRODUCTS } from "./seed";
import type { Product } from "./types";

// Plain JSON store on /tmp. Survives within a warm serverless instance
// (~15 min idle on Vercel). Cold starts re-seed. Real durable storage
// arrives once the user provisions Postgres / Neon.
const STORAGE_PATH = path.join("/tmp", "quick-flip-products.json");

let cache: Product[] | null = null;
let loadPromise: Promise<Product[]> | null = null;

async function load(): Promise<Product[]> {
  if (cache) return cache;
  if (!loadPromise) {
    loadPromise = (async () => {
      try {
        const buf = await fs.readFile(STORAGE_PATH, "utf8");
        cache = JSON.parse(buf) as Product[];
      } catch {
        cache = [...SEED_PRODUCTS];
        await persist();
      }
      return cache!;
    })();
  }
  return loadPromise;
}

async function persist(): Promise<void> {
  if (!cache) return;
  try {
    await fs.writeFile(STORAGE_PATH, JSON.stringify(cache, null, 2));
  } catch {
    // /tmp may not be writable in some local dev contexts; silently
    // fall back to in-memory only.
  }
}

export async function listProducts(): Promise<Product[]> {
  const all = await load();
  return [...all].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getProduct(id: string): Promise<Product | null> {
  const all = await load();
  return all.find((p) => p.id === id) ?? null;
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
  cache = all;
  await persist();
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
  cache = all;
  await persist();
  return updated;
}

export async function deleteProduct(id: string): Promise<void> {
  const all = await load();
  cache = all.filter((p) => p.id !== id);
  await persist();
}

function randomId(): string {
  return (
    Math.random().toString(36).slice(2, 10) +
    Date.now().toString(36)
  );
}
