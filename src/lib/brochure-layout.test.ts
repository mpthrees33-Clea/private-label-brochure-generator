import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BOTTOM_BLOCK_H,
  PAGE_H,
  computeSwatchLayout,
  sizeMatrixTop,
} from "./brochure-layout";

const SPECS_TOP = PAGE_H - BOTTOM_BLOCK_H;

function voidAboveSpecs(colorCount: number, hasDeco: boolean): number {
  const layout = computeSwatchLayout(colorCount, hasDeco);
  // Header (68) + one row per color (22) + a short footnote line (16).
  const matrixH = 68 + colorCount * 22 + 16;
  return SPECS_TOP - (sizeMatrixTop(layout) + matrixH);
}

describe("page 2 swatch stack", () => {
  it("keeps every swatch at a 1:2 ratio", () => {
    for (const [count, deco] of [
      [4, false],
      [4, true],
      [5, true],
      [8, false],
    ] as const) {
      const layout = computeSwatchLayout(count, deco);
      assert.equal(layout.height, layout.width * 2, `${count} deco=${deco}`);
    }
  });

  it("wraps a 4-color wall line so the size chart is not stranded above the specs", () => {
    const layout = computeSwatchLayout(4, false);
    assert.equal(layout.primaryRows, 2);
    assert.equal(layout.perRow, 2);
    const gap = voidAboveSpecs(4, false);
    assert.ok(gap >= 8 && gap <= 96, `void above specs was ${gap}px`);
  });

  it("keeps a deco collection on one primary row when that already fills the page", () => {
    assert.equal(computeSwatchLayout(4, true).primaryRows, 1);
    assert.equal(computeSwatchLayout(5, true).primaryRows, 1);
    const gap = voidAboveSpecs(5, true);
    assert.ok(gap >= 8 && gap <= 96, `kendall-like void was ${gap}px`);
  });

});
