import type { Product } from "./types";
import { KENDALL_SAMPLE } from "../sample-data";

// Initial seed so the dashboard has something to look at before any
// scrapes have happened. Mirrors the 4 reference brochures in the
// crossover example: factory pages → Trinity collections.
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
];
