import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { brochureWarnings } from "../brochure-quality";
import { scrapedToBrochure } from "../scraped-to-brochure";
import type { ScrapedProduct } from "./types";
import {
  imageForListing,
  listingsFromShopifyPayload,
  scoreSkuListing,
  sizeKeysIn,
  upgradeFullFaceImages,
  type FaceQuery,
  type SkuListing,
} from "./full-face";

const desertSquare: SkuListing = {
  handle: "aura-au01-desert-deep-glaze-8x8",
  title: "Aura AU01 Desert Deep Glaze 8x8",
  images: [{ src: "https://cdn.example/desert-8x8.jpg", width: 1250, height: 1250 }],
  featuredImages: [{ src: "https://cdn.example/desert-strip.jpg", width: 670, height: 210 }],
};

const desertGloss: SkuListing = {
  handle: "aura-au01-desert-glossy-3x16",
  title: "Aura AU01 Desert Glossy 3x16",
  images: [{ src: "https://cdn.example/desert-gloss.jpg", width: 1250, height: 1250 }],
  featuredImages: [{ src: "https://cdn.example/desert-gloss-strip.jpg", width: 670, height: 210 }],
};

const lagoonMatt: SkuListing = {
  handle: "aura-au02-lagoon-matt-3z16",
  title: "Aura AU02 Lagoon Matt 3x16",
  images: [{ src: "https://cdn.example/lagoon-matt.jpg", width: 1250, height: 1250 }],
};

function query(partial: Partial<FaceQuery> & Pick<FaceQuery, "colorTokens" | "finish">): FaceQuery {
  return {
    collectionTokens: ["aura"],
    widthIn: 8,
    heightIn: 8,
    ratio: 1,
    ...partial,
  };
}

describe("sibling sku full-face match", () => {
  it("reads a 3z16 handle as the 3x16 tile", () => {
    assert.deepEqual(sizeKeysIn("aura-au02-lagoon-matt-3z16"), ["3x16"]);
    assert.deepEqual(sizeKeysIn("670x210"), []);
  });

  it("matches collection, color, finish, and size, including the matt typo", () => {
    assert.ok(scoreSkuListing(desertSquare, query({ colorTokens: ["desert"], finish: "deep glaze" })) > 0);
    assert.ok(
      scoreSkuListing(
        lagoonMatt,
        query({ colorTokens: ["lagoon"], finish: "matte", widthIn: 3, heightIn: 16, ratio: 16 / 3 }),
      ) > 0,
    );
    assert.equal(
      scoreSkuListing(desertGloss, query({ colorTokens: ["desert"], finish: "matte", widthIn: 3, heightIn: 16, ratio: 16 / 3 })),
      0,
    );
    assert.equal(
      scoreSkuListing(desertGloss, query({ colorTokens: ["desert"], finish: "glossy" })),
      0,
    );
    assert.equal(
      scoreSkuListing(desertSquare, query({ colorTokens: ["desert"], finish: "deep glaze", collectionTokens: ["origin"] })),
      0,
    );
  });

  it("prefers the square product image over the strip featured image", async () => {
    let measured = 0;
    const image = await imageForListing(desertSquare, 1, async () => {
      measured += 1;
      return { width: 1200, height: 225 };
    });
    assert.equal(measured, 0);
    assert.equal(image?.url, "https://cdn.example/desert-8x8.jpg");
    assert.equal(image?.width, 1250);
  });

  it("accepts a padded plank only after its trimmed shape matches", async () => {
    const image = await imageForListing(desertGloss, 16 / 3, async () => ({ width: 1200, height: 225 }));
    assert.equal(image?.url, "https://cdn.example/desert-gloss.jpg");
    assert.equal(image?.width, 1200);
    assert.equal(image?.height, 225);
  });

  it("replaces mismatched cards from products.json and flags a leftover", async () => {
    const product = auraProduct();
    const payload = listingsFromShopifyPayload({
      products: [desertSquare, desertGloss, lagoonMatt],
    });
    assert.equal(payload.length, 3);
    await upgradeFullFaceImages(
      product,
      { pageUrl: "https://shop.example/products/aura" },
      {
        fetchText: async (url) => {
          if (!url.includes("products.json")) return null;
          return {
            ok: true,
            contentType: "application/json",
            text: JSON.stringify({ products: [desertSquare, desertGloss, lagoonMatt] }),
          };
        },
        measure: async (url) => (url.includes("desert-gloss") ? { width: 1200, height: 225 } : null),
      },
    );
    const desert = product.colors[0].faces ?? [];
    assert.equal(desert[0].imageUrl, "https://cdn.example/desert-8x8.jpg");
    assert.equal(desert[0].photoWidth, 1250);
    assert.equal(desert[0].photoMismatch, false);
    assert.equal(desert[1].imageUrl, "https://cdn.example/desert-gloss.jpg");
    assert.equal(desert[1].photoWidth, 1200);
    assert.equal(desert[1].photoHeight, 225);
    assert.equal(desert[1].photoMismatch, false);
    const orphan = product.colors[1].faces?.[0];
    assert.equal(orphan?.imageUrl, "https://cdn.example/clay-strip.jpg");
    assert.equal(orphan?.photoMismatch, true);
    const cloud = product.colors[2].faces?.[0];
    assert.equal(cloud?.imageUrl, "https://cdn.example/cloud.jpg");
    assert.equal(cloud?.photoMismatch, undefined);
    const warnings = brochureWarnings(scrapedToBrochure(product));
    assert.equal(warnings.includes("photo-shape"), true);
  });
});

function auraProduct(): ScrapedProduct {
  return {
    factory: "other",
    factoryName: "Aura",
    factoryUrl: "https://shop.example/products/aura",
    suggestedTrinityName: "saluda",
    suggestedTagline: "glazed porcelain tile",
    suggestedDescription: "{{name}} is a glazed porcelain tile with a soft arc relief.",
    heroImageUrl: "https://cdn.example/hero.jpg",
    colors: [
      {
        name: "au 01 desert",
        imageUrl: "https://cdn.example/desert-strip.jpg",
        faces: [
          {
            imageUrl: "https://cdn.example/desert-strip.jpg",
            finish: "deep glaze",
            widthIn: 8,
            heightIn: 8,
            aspectRatio: 1,
            sizeUnknown: false,
            photoWidth: 670,
            photoHeight: 210,
          },
          {
            imageUrl: "https://cdn.example/desert-gloss-strip.jpg",
            finish: "glossy",
            widthIn: 3,
            heightIn: 16,
            aspectRatio: 16 / 3,
            sizeUnknown: false,
            photoWidth: 670,
            photoHeight: 210,
          },
        ],
      },
      {
        name: "au 06 clay",
        imageUrl: "https://cdn.example/clay-strip.jpg",
        faces: [
          {
            imageUrl: "https://cdn.example/clay-strip.jpg",
            finish: "deep glaze",
            widthIn: 8,
            heightIn: 8,
            aspectRatio: 1,
            sizeUnknown: false,
            photoWidth: 670,
            photoHeight: 210,
          },
        ],
      },
      {
        name: "cloud",
        imageUrl: "https://cdn.example/cloud.jpg",
        faces: [
          {
            imageUrl: "https://cdn.example/cloud.jpg",
            finish: null,
            widthIn: 4,
            heightIn: 4,
            aspectRatio: 1,
            sizeUnknown: false,
          },
        ],
      },
    ],
    sizes: [],
    availability: {},
    techSpecs: {
      thickness: "8mm",
      shadeVariation: "v2",
      waterAbsorption: "0.1%",
      breakingStrength: "400 lbf",
    },
    finishLegend: [],
    footnotes: [],
  };
}
