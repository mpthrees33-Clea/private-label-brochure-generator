import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  groundTechSpecs,
  parseTechSpecItems,
  parseTechSpecsFromHtml,
  type SpecTextItem,
} from "./spec-parse";

const PORTOBELLO = `<div class="item-tecnico"><p class="item">thickness (mm)</p><p class="resultado-item">7</p></div>
<div class="item-tecnico"><p class="item">SHADE variation</p><p class="resultado-item">v4</p></div>
<div class="item-tecnico"><p class="item">water absorption</p><p class="resultado-item">&lt;=7%</p></div>
<div class="item-tecnico"><p class="item">DCOF</p><p class="resultado-item">wall applications</p></div>`;

const ATLAS = `<table><tr><td>Thickness</td><td>9mm</td><td>9mm</td></tr>
<tr><td>Color Variation</td><td>V3</td><td>V3</td></tr>
<tr><td>Water Absorption (C373)</td><td>&gt; 15%</td><td>&gt; 15%</td></tr>
<tr><td>Chemical Resistance (C650)</td><td>Class B</td><td>Class B</td></tr>
<tr><td>Breaking Strength (C648)</td><td>N/A</td><td>N/A</td></tr>
<tr><td>Frost Resistant</td><td>No</td><td>No</td></tr></table>`;

function item(str: string, x: number, y: number): SpecTextItem {
  return { str, x, y, width: str.length * 8 };
}

describe("tech spec parsing", () => {
  it("reads label/value pairs and skips non-numbers", () => {
    const specs = parseTechSpecsFromHtml(PORTOBELLO);
    assert.equal(specs.thickness, "7mm");
    assert.equal(specs.shadeVariation, "v4");
    assert.equal(specs.waterAbsorption, "≤ 7%");
    assert.equal(specs.dcof, undefined);
  });

  it("reads a spec table and does not turn N/A into a value", () => {
    const specs = parseTechSpecsFromHtml(ATLAS);
    assert.equal(specs.thickness, "9mm");
    assert.equal(specs.shadeVariation, "v3");
    assert.equal(specs.waterAbsorption, "> 15%");
    assert.equal(specs.chemicalResistance, "class b");
    assert.equal(specs.breakingStrength, undefined);
    assert.equal(specs.frostResistance, undefined);
  });

  it("reads a PDF spec grid by row and keeps the declared measurement", () => {
    const items: SpecTextItem[] = [
      item("Thickness:", 100, 500),
      item("7.0 mm( 3x6, 4x4)", 320, 500),
      item("7.3 mm (3x12)", 320, 474),
      item("WATER ABSORPTION", 40, 400),
      item("C373", 200, 400),
      item("<7.0% < wa ≤20%", 300, 400),
      item("≤20%", 460, 400),
      item("BREAKING STRENGTH", 40, 360),
      item("≥ 125", 300, 360),
      item("Not Applicable", 460, 360),
      item("SCRATCH HARDNESS", 40, 320),
      item("Not Applicable", 460, 320),
      item("CHEMICAL RESISTANCE", 40, 280),
      item("Unaffected", 460, 280),
      item("SHADE AND TEXTURE RATING", 40, 240),
      item("V2", 460, 240),
    ];
    const specs = parseTechSpecItems(items);
    assert.equal(specs.thickness, "7mm | 7.3mm");
    assert.equal(specs.waterAbsorption, "≤ 20%");
    assert.equal(specs.breakingStrength, "≥ 125");
    assert.equal(specs.scratchHardness, undefined);
    assert.equal(specs.chemicalResistance, "unaffected");
    assert.equal(specs.shadeVariation, "v2");
  });

  it("reads values stacked under a two-line header", () => {
    const items: SpecTextItem[] = [
      item("Breaking", 294, 389),
      item("Strength", 294, 383),
      item("≥ 125 lbf", 293, 369),
      item("Mohs", 331, 389),
      item("Hardness", 326, 382),
      item("5", 336, 369),
      item("Water", 166, 389),
      item("Absorption", 160, 383),
      item("≤ 7%", 166, 371),
      item("Shade", 100, 389),
      item("Variation", 96, 383),
      item("V4", 104, 371),
      item("Chemical", 260, 389),
      item("Resistant", 260, 383),
      item("Class E", 262, 371),
      item("Stain", 200, 389),
      item("Resistant", 194, 383),
      item("Class E", 196, 371),
      item("Freeze", 66, 389),
      item("Resistant", 63, 383),
      item("Not", 70, 371),
      item("Resistant", 62, 365),
      item("watercolor", 310, 588),
    ];
    const specs = parseTechSpecItems(items);
    assert.equal(specs.breakingStrength, "≥ 125 lbf");
    assert.equal(specs.scratchHardness, "5");
    assert.equal(specs.waterAbsorption, "≤ 7%");
    assert.equal(specs.shadeVariation, "v4");
    assert.equal(specs.chemicalResistance, "class e");
    assert.equal(specs.stainResistance, "class e");
    assert.equal(specs.frostResistance, undefined);
  });

  it("drops specs whose numbers are not in the source", () => {
    const invented = groundTechSpecs(
      {
        thickness: "9mm",
        shadeVariation: "v3",
        waterAbsorption: "> 15%",
        chemicalResistance: "class b",
      },
      "Thickness: 7.0 mm 7.3 mm WATER ABSORPTION ≤20% SHADE V2 CHEMICAL Unaffected",
    );
    assert.deepEqual(invented, {});
    const real = groundTechSpecs(
      { thickness: "9mm", shadeVariation: "v3", waterAbsorption: "> 15%", chemicalResistance: "class b" },
      "Thickness 9mm Color Variation V3 Water Absorption > 15% Chemical Resistance Class B",
    );
    assert.equal(real.thickness, "9mm");
    assert.equal(real.shadeVariation, "v3");
    assert.equal(real.waterAbsorption, "> 15%");
    assert.equal(real.chemicalResistance, "class b");
  });
});
