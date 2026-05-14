import { promises as fs } from "fs";
import path from "path";
import type { BrochureData } from "../brochure-types";

// Plain JSON store, same pattern as products. Real durable storage
// arrives when the user provisions Postgres.
const STORAGE_PATH = path.join("/tmp", "quick-flip-lessons.json");

export interface Lesson {
  id: string;
  productId: string;
  factoryUrl: string;
  /** Display name of the factory, e.g. "Florida Tile". */
  factory: string;
  /** What the rep typed. */
  instruction: string;
  /** Short, AI-generated description of what changed — used in few-shot. */
  summary: string;
  /** Snapshot of the product BEFORE the edit. */
  before: BrochureData;
  /** Snapshot of the product AFTER the edit. */
  after: BrochureData;
  createdAt: string;
}

let cache: Lesson[] | null = null;
let loadPromise: Promise<Lesson[]> | null = null;

async function load(): Promise<Lesson[]> {
  if (cache) return cache;
  if (!loadPromise) {
    loadPromise = (async () => {
      try {
        const buf = await fs.readFile(STORAGE_PATH, "utf8");
        cache = JSON.parse(buf) as Lesson[];
      } catch {
        cache = [];
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
    // /tmp may not be writable in some local dev contexts
  }
}

export async function listLessons(): Promise<Lesson[]> {
  const all = await load();
  return [...all].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function listLessonsForProduct(productId: string): Promise<Lesson[]> {
  const all = await load();
  return all
    .filter((l) => l.productId === productId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function createLesson(
  input: Omit<Lesson, "id" | "createdAt">,
): Promise<Lesson> {
  const all = await load();
  const lesson: Lesson = {
    ...input,
    id: randomId(),
    createdAt: new Date().toISOString(),
  };
  all.push(lesson);
  cache = all;
  await persist();
  return lesson;
}

/**
 * Return the most-relevant lessons to inject as few-shot when scraping
 * a new factory URL. Same-factory lessons rank highest; then the most
 * recent globally. Caps at `limit` to keep prompt size predictable.
 */
export async function relevantLessonsForScrape(
  factoryHost: string,
  limit = 6,
): Promise<Lesson[]> {
  const all = await listLessons();
  if (all.length === 0) return [];
  const sameFactory: Lesson[] = [];
  const otherFactory: Lesson[] = [];
  for (const l of all) {
    try {
      const host = new URL(l.factoryUrl).hostname.replace(/^www\./, "");
      if (host === factoryHost) sameFactory.push(l);
      else otherFactory.push(l);
    } catch {
      otherFactory.push(l);
    }
  }
  return [...sameFactory, ...otherFactory].slice(0, limit);
}

function randomId(): string {
  return (
    Math.random().toString(36).slice(2, 10) +
    Date.now().toString(36)
  );
}
