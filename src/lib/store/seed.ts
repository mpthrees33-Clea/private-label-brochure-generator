import type { Product } from "./types";
import {
  KENDALL_SAMPLE,
  LUNETT_SAMPLE,
  OBERLIN_SAMPLE,
  TORRANCE_SAMPLE,
} from "../sample-data";

// Initial seed mirrors the 4 reference brochures supplied by Trinity.
// All 4 must be in the crossover from the start — the crossover is the
// source of truth for "what's been private-labeled". See feedback memory
// `brochure-crossover-dedupe`.
//
// factory + factoryName + factoryUrl are best-effort placeholders for
// the 3 newer entries; reps can edit them via the product edit page.
// The factoryUrl strings are intentionally unique so the dedupe check
// (normalizeFactoryUrl) doesn't false-match.
export const SEED_PRODUCTS: Product[] = [
  {
    id: "seed-kendall",
    ...KENDALL_SAMPLE,
    factory: "Florida Tile",
    factoryName: "Artecrete",
    factoryUrl: "https://floridatile.com/products/artecrete/",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "seed-lunett",
    ...LUNETT_SAMPLE,
    factory: "(edit me)",
    factoryName: "(edit me)",
    factoryUrl: "https://trinitysurfaces.com/reference/lunett",
    createdAt: "2026-01-02T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
  },
  {
    id: "seed-oberlin",
    ...OBERLIN_SAMPLE,
    factory: "(edit me)",
    factoryName: "(edit me)",
    factoryUrl: "https://trinitysurfaces.com/reference/oberlin",
    createdAt: "2026-01-03T00:00:00.000Z",
    updatedAt: "2026-01-03T00:00:00.000Z",
  },
  {
    id: "seed-torrance",
    ...TORRANCE_SAMPLE,
    factory: "(edit me)",
    factoryName: "(edit me)",
    factoryUrl: "https://trinitysurfaces.com/reference/torrance",
    createdAt: "2026-01-04T00:00:00.000Z",
    updatedAt: "2026-01-04T00:00:00.000Z",
  },
];
