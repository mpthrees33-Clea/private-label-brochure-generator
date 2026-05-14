import type { BrochureData } from "../brochure-types";

// A "product" is a private-labeled brochure record. It holds both the
// presentation data (BrochureData) and provenance — which factory page
// it was scraped from. Stored in /tmp/quick-flip-products.json for V1.
// Swap to Prisma + Postgres when the user provisions a DB.
export interface Product extends BrochureData {
  id: string;
  factory: string;
  factoryName: string;
  factoryUrl: string;
  createdAt: string;
  updatedAt: string;
}
