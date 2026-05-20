import { readJsonStore, writeJsonStore } from "./blob-storage";
import type { BrochureData } from "../brochure-types";

// Lessons are read-through against Vercel Blob (or /tmp locally). Same
// rationale as the products store — a Lesson created on instance A must
// be visible to the AI scraper running on any other instance.
const PATHNAME = "store/lessons.json";

// Discriminator for what kind of correction created this lesson. Older
// lessons in the store have no kind field — treat them as "edit-chat".
export type LessonKind = "edit-chat" | "image-fix" | "rename" | "drag";

/** Image-fix details: which image the scraper missed + what the rep used. */
export interface ImageFixDetails {
  field: "heroImageUrl" | "imageUrl" | "decoImageUrl";
  /** Trinity color name, when field is imageUrl/decoImageUrl. */
  colorName?: string;
  /** What the scraper returned (typically "" if it gave up). */
  before: string;
  /** What the rep replaced it with. */
  after: string;
}

/** Rename details: scraper-suggested value vs. rep's final value. */
export interface RenameDetails {
  field: "trinityName" | "trinityTagline" | "description";
  before: string;
  after: string;
}

/** Drag details: which block the rep repositioned + final offset.
 *  Used for factory-default clustering, NOT for AI prompt injection. */
export interface DragDetails {
  blockId: string;
  before: { x: number; y: number } | null;
  after: { x: number; y: number };
}

export type LessonDetails = ImageFixDetails | RenameDetails | DragDetails;

export interface Lesson {
  id: string;
  productId: string;
  factoryUrl: string;
  /** Display name of the factory, e.g. "Florida Tile". */
  factory: string;
  /** What the rep typed (edit-chat only). Other kinds use synthetic strings. */
  instruction: string;
  /** Short, AI-generated description of what changed — used in few-shot. */
  summary: string;
  /** Snapshot of the product BEFORE the edit. */
  before: BrochureData;
  /** Snapshot of the product AFTER the edit. */
  after: BrochureData;
  /** What kind of correction this lesson represents. Missing on legacy
   *  rows — treat as "edit-chat". */
  kind?: LessonKind;
  /** Kind-specific details (the actual signal). Missing on legacy rows. */
  details?: LessonDetails;
  createdAt: string;
}

async function load(): Promise<Lesson[]> {
  return readJsonStore<Lesson[]>(PATHNAME, []);
}

async function save(all: Lesson[]): Promise<void> {
  await writeJsonStore(PATHNAME, all);
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

export async function deleteLesson(id: string): Promise<void> {
  const all = await load();
  const remaining = all.filter((l) => l.id !== id);
  await save(remaining);
}

export async function getLatestLessonForProduct(
  productId: string,
): Promise<Lesson | null> {
  const list = await listLessonsForProduct(productId);
  return list[0] ?? null;
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
  await save(all);
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
  // Drag lessons are stored for factory-default clustering, not for AI
  // prompt injection — they're layout offsets in pixels, useless as
  // few-shot text. Filter them out before ranking.
  const promptable = all.filter((l) => l.kind !== "drag");
  const sameFactory: Lesson[] = [];
  const otherFactory: Lesson[] = [];
  for (const l of promptable) {
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

/** All drag lessons for a given factory host (no limit; clustering
 *  function below caps consumption). */
export async function dragLessonsForFactory(
  factoryHost: string,
): Promise<Lesson[]> {
  const all = await listLessons();
  return all.filter((l) => {
    if (l.kind !== "drag") return false;
    try {
      const host = new URL(l.factoryUrl).hostname.replace(/^www\./, "");
      return host === factoryHost;
    } catch {
      return false;
    }
  });
}

function randomId(): string {
  return (
    Math.random().toString(36).slice(2, 10) +
    Date.now().toString(36)
  );
}
