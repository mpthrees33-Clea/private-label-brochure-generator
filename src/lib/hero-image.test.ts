import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pickHeroImage } from "./hero-image";

describe("hero image", () => {
  it("keeps the only room scene when the page has no closer lead photo", () => {
    const hero = pickHeroImage(
      [
        {
          url: "https://cdn.example/room_scenes/fluent_bath_slider.jpeg",
          alt: "lead image",
        },
        {
          url: "https://cdn.example/fluent_white_4x16_glossy_v1jpg_larger.png",
          alt: "White Glossy Wall Tile 4x16",
          width: 200,
          height: 800,
        },
      ],
      "Fluent",
    );
    assert.equal(hero?.includes("room_scenes"), true);
  });

  it("prefers a portrait install over a wide room banner and a color chip", () => {
    const hero = pickHeroImage(
      [
        {
          url: "https://www.delconcausa.com/cdn/shop/files/Aura_Eucalyptus_Desert_Bathroom_1600x1200_b.jpg?width=670",
          width: 1600,
          height: 1200,
        },
        {
          url: "https://www.delconcausa.com/cdn/shop/files/Aura_Eucalyptus_Puro_Living_2800x1000_a.jpg",
          width: 2800,
          height: 1000,
        },
        {
          url: "https://www.delconcausa.com/cdn/shop/files/Aura_Puro_Slate_Bathroom_1080.jpg",
          width: 872,
          height: 1080,
        },
        {
          url: "https://www.delconcausa.com/cdn/shop/files/Aura_Puro_20x20_b.jpg?width=670",
          width: 670,
          height: 210,
        },
      ],
      "Aura",
    );
    assert.equal(hero?.includes("Puro_Slate_Bathroom_1080"), true);
    assert.equal(hero?.includes("width="), false);
  });

  it("prefers the collection banner over a sitewide trendbook and an unrelated hero file", () => {
    const hero = pickHeroImage(
      [
        {
          url: "https://www.portobelloamerica.com/wp-content/uploads/2026/02/Banner-Trendbook2026-sanstext.jpg",
          width: 2560,
          height: 1440,
        },
        {
          url: "https://www.portobelloamerica.com/wp-content/uploads/2026/03/field-tile-hero.webp",
          alt: "",
        },
        {
          url: "https://images.portobelloamerica.com/watercolor_296.jpg",
          alt: "WATERCOLOR",
          lead: true,
        },
        {
          url: "https://product.portobelloamerica.com/watercolor-denim-04x16-glossy.jpg",
          width: 200,
          height: 800,
        },
      ],
      "Watercolor",
    );
    assert.equal(hero?.includes("watercolor_296"), true);
  });

  it("skips a sell sheet and uses the mosaic when that is the tile photo", () => {
    const hero = pickHeroImage(
      [
        {
          url: "https://style-access.com/wp-content/uploads/2026/05/Atlas-SS-TN.jpeg",
          width: 834,
          height: 1079,
          linkHref: "https://drive.google.com/file/d/abc/view",
        },
        {
          url: "https://style-access.com/wp-content/uploads/2026/05/Alabaster-4x4-Large.jpeg",
          width: 1079,
          height: 1079,
        },
      ],
      "Atlas",
    );
    assert.equal(hero?.includes("Alabaster-4x4"), true);
  });
});
