import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { reconcileFinishLegend } from "./finish-legend";
import type { BrochureData } from "./brochure-types";

function product(partial: Partial<BrochureData>): BrochureData {
  return {
    trinityName: "sample",
    trinityTagline: "glazed ceramic wall tile",
    description: "{{name}} is a glazed ceramic wall tile.",
    heroImageUrl: "https://cdn.example/hero.jpg",
    colors: [],
    sizes: [],
    availability: {},
    techSpecs: {},
    finishLegend: ["matte"],
    footnotes: [],
    ...partial,
  };
}

describe("reconcileFinishLegend", () => {
  it("uses glossy from the watercolor filenames when the legend defaulted to matte", () => {
    const legend = reconcileFinishLegend(
      product({
        description: "{{name}} brings a rich glossy finish to interior walls.",
        colors: [
          {
            trinityName: "denim",
            imageUrl:
              "https://www.portobelloamerica.com/watercolor-denim-glossy-pressed-04x16-glossy.jpg",
          },
        ],
      }),
    );
    assert.deepEqual(legend, ["glossy"]);
  });

  it("uses semi-gloss from the description and ignores a glossy-depth phrase", () => {
    const legend = reconcileFinishLegend(
      product({
        description: "{{name}} brings zellige-inspired character with semi-gloss depth.",
        colors: [{ trinityName: "alabaster", imageUrl: "https://cdn.example/Alabaster-4x4-Large.jpeg" }],
      }),
    );
    assert.deepEqual(legend, ["semi-gloss"]);

    const depthOnly = reconcileFinishLegend(
      product({
        description: "soft variation, glossy depth, and handcrafted character.",
        colors: [{ trinityName: "alabaster", imageUrl: "https://cdn.example/Alabaster-4x4-Large.jpeg" }],
      }),
    );
    assert.deepEqual(depthOnly, ["matte"]);
  });

  it("does not collapse a collection that is actually offered in several finishes", () => {
    const legend = reconcileFinishLegend(
      product({
        finishLegend: ["glossy", "deep glaze", "matte"],
        colors: [
          {
            trinityName: "puro",
            imageUrl: "https://cdn.example/Puro_Glossy_3x16.jpg",
            faces: [
              { imageUrl: "https://cdn.example/Puro_Matt_3x16.jpg", finish: "matte" },
              { imageUrl: "https://cdn.example/Puro_Glossy_3x16.jpg", finish: "glossy" },
            ],
          },
        ],
      }),
    );
    assert.deepEqual(legend, ["glossy", "deep glaze", "matte"]);
  });
});
