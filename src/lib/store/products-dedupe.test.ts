import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { dedupeByFactoryUrl, normalizeFactoryUrl } from "./products";
import type { Product } from "./types";

function row(id: string, factoryUrl: string, updatedAt: string): Product {
  return {
    id,
    factory: "Del Conca",
    factoryName: "Aura",
    factoryUrl,
    trinityName: id,
    trinityTagline: "glazed porcelain",
    description: "{{name}} is a glazed porcelain for floors and walls.",
    heroImageUrl: "https://cdn.example/hero.jpg",
    colors: [],
    sizes: [],
    availability: {},
    finishLegend: [],
    footnotes: [],
    techSpecs: {},
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt,
  };
}

describe("factory url dedupe", () => {
  it("treats www, trailing slash, and tracking params as the same page", () => {
    assert.equal(
      normalizeFactoryUrl("https://www.delconcausa.com/products/aura/?utm_source=x"),
      normalizeFactoryUrl("http://delconcausa.com/products/aura"),
    );
  });

  it("keeps the newer scrape and leaves PDF uploads alone", () => {
    const older = row("a", "https://www.delconcausa.com/products/aura/", "2026-05-01T00:00:00.000Z");
    const newer = row("b", "https://delconcausa.com/products/aura", "2026-06-01T00:00:00.000Z");
    const upload = row("c", "", "2026-04-01T00:00:00.000Z");
    const otherUpload = row("d", "", "2026-04-02T00:00:00.000Z");
    const { products, changed } = dedupeByFactoryUrl([older, newer, upload, otherUpload]);
    assert.equal(changed, true);
    assert.deepEqual(
      products.map((product) => product.id),
      ["b", "c", "d"],
    );
  });
});
