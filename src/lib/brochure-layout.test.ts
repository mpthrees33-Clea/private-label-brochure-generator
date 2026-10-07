import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BOTTOM_BLOCK_H,
  PAGE_H,
  computeSwatchLayout,
  sizeMatrixTop,
  swatchLabelLines,
} from "./brochure-layout";

const SPECS_TOP = PAGE_H - BOTTOM_BLOCK_H;

function ratiosFor(colorCount: number, faces: number[]): number[][] {
  return Array.from({ length: colorCount }, () => faces);
}

function voidAboveSpecs(colorCount: number, faces: number[]): number {
  const layout = computeSwatchLayout(colorCount, faces.length > 1, [], ratiosFor(colorCount, faces));
  // Header (68) + one row per color (22) + a short footnote line (16).
  const matrixH = 68 + colorCount * 22 + 16;
  return SPECS_TOP - (sizeMatrixTop(layout) + matrixH);
}

describe("page 2 swatch stack", () => {
  it("keeps a parsed 12x24 field at 1:2 and does not invent that frame", () => {
    for (const [count, faces] of [
      [4, [0.5]],
      [4, [0.5, 0.5]],
      [5, [0.5, 0.5]],
      [8, [0.5]],
    ] as const) {
      const layout = computeSwatchLayout(count, faces.length > 1, [], ratiosFor(count, [...faces]));
      assert.equal(layout.height, layout.width * 2, `${count} faces=${faces.join(",")}`);
    }
    const unspecified = computeSwatchLayout(4, false);
    assert.equal(unspecified.height, unspecified.width);
    assert.notEqual(unspecified.height, unspecified.width * 2);
  });

  it("wraps a 4-color 12x24 line so the size chart is not stranded above the specs", () => {
    const layout = computeSwatchLayout(4, false, [], ratiosFor(4, [0.5]));
    assert.equal(layout.primaryRows, 2);
    assert.equal(layout.perRow, 2);
    const gap = voidAboveSpecs(4, [0.5]);
    assert.ok(gap >= 8 && gap <= 96, `void above specs was ${gap}px`);
  });

  it("keeps a 12x24 deco collection on one primary row when that already fills the page", () => {
    assert.equal(computeSwatchLayout(4, true, [], ratiosFor(4, [0.5, 0.5])).primaryRows, 1);
    assert.equal(computeSwatchLayout(5, true, [], ratiosFor(5, [0.5, 0.5])).primaryRows, 1);
    const gap = voidAboveSpecs(5, [0.5, 0.5]);
    assert.ok(gap >= 8 && gap <= 96, `kendall-like void was ${gap}px`);
  });

  it("reserves a second caption line when a color name wraps", () => {
    const longName = "au 02 lagoon deep glaze";
    const longNames = Array.from({ length: 18 }, () => longName);
    const wrapped = computeSwatchLayout(18, false, longNames, ratiosFor(18, [0.5]));
    const short = computeSwatchLayout(
      18,
      false,
      Array.from({ length: 18 }, () => "lagoon"),
      ratiosFor(18, [0.5]),
    );
    assert.equal(computeSwatchLayout(4, false, [], ratiosFor(4, [0.5])).labelHeight, 22);
    assert.equal(short.labelHeight, 22);
    assert.equal(swatchLabelLines("lagoon", short.width), 1);
    assert.equal(wrapped.labelHeight, 32);
    assert.equal(swatchLabelLines(longName, wrapped.width), 2);
    assert.ok(sizeMatrixTop(wrapped) >= sizeMatrixTop(short));
    assert.equal(wrapped.height, wrapped.width * 2);
  });

  it("uses the tile ratio instead of a fixed portrait crop", () => {
    const square = computeSwatchLayout(
      6,
      false,
      [],
      Array.from({ length: 6 }, () => [1]),
    );
    assert.equal(square.height, square.width);
    assert.ok(square.width >= 72);

    const mixed = computeSwatchLayout(
      6,
      false,
      ["au 10 puro deep glaze"],
      Array.from({ length: 6 }, () => [1, 16 / 3, 16 / 3]),
    );
    assert.equal(mixed.faceRatios[0], 1);
    assert.ok(mixed.faceRatios[1] > 1);
    const gap = (() => {
      const matrixH = 68 + 6 * 22 + 16;
      return SPECS_TOP - (sizeMatrixTop(mixed) + matrixH);
    })();
    assert.ok(gap >= 8, `mixed-face void was ${gap}px`);
    assert.ok(mixed.width >= 72, `mixed width ${mixed.width}`);
  });

  it("fits nine upright 4x16 tiles without dropping under the minimum slot", () => {
    const layout = computeSwatchLayout(9, false, [], ratiosFor(9, [0.25]));
    assert.equal(layout.height, layout.width * 4);
    assert.ok(layout.width >= 64, `4x16 width ${layout.width}`);
    const gap = voidAboveSpecs(9, [0.25]);
    assert.ok(gap >= 8, `4x16 void was ${gap}px`);
  });

});
