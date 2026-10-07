import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { bestImageUrl, imagePixelScore, upgradeImageUrl } from "./image-url";

describe("image urls", () => {
  it("drops a Shopify width cap so the original file is fetched", () => {
    const capped =
      "https://www.delconcausa.com/cdn/shop/files/Aura_Eucalyptus_Desert_Bathroom_1600x1200_b99.jpg?v=1739371158&width=670";
    const upgraded = upgradeImageUrl(capped);
    assert.equal(upgraded.includes("width="), false);
    assert.equal(upgraded.includes("Aura_Eucalyptus_Desert_Bathroom"), true);
  });

  it("leaves a cropped Shopify rendition alone", () => {
    const cropped =
      "https://www.delconcausa.com/cdn/shop/files/tile.jpg?crop=center&height=1200&width=1200";
    assert.equal(upgradeImageUrl(cropped), cropped);
  });

  it("prefers an unconstrained file over a width-limited srcset candidate", () => {
    const original =
      "https://style-access.com/wp-content/uploads/2026/05/Alabaster-4x4-Large.jpeg";
    const rendition =
      "https://style-access.com/wp-content/uploads/2026/05/Alabaster-4x4-Large-1080x1080.jpeg";
    assert.ok(imagePixelScore(original) > imagePixelScore(rendition));
    assert.equal(bestImageUrl([rendition, "data:image/gif;base64,abc", original]), original);
  });

  it("prefers the larger thumbor trim and the Florida Tile _larger twin", () => {
    const small =
      "https://images.portobelloamerica.com/unsafe/trim/900x/filters::no_upscale()/https://product.example/a.jpg";
    const large =
      "https://images.portobelloamerica.com/unsafe/trim/1920x/filters::no_upscale()/https://product.example/a.jpg";
    assert.equal(bestImageUrl([small, large]), large);
    assert.equal(
      upgradeImageUrl("https://cdn.example/fluent_white_public.png"),
      "https://cdn.example/fluent_white_larger.png",
    );
  });
});
