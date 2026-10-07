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

  it("keeps the average breaking strength and a printed shade", () => {
    const html = `<table><tr><td>Breaking strength</td><td>ASTM C648</td><td>≥ 125 lbf</td><td>≥350 lbf</td></tr>
      <tr><td>Shade variation</td><td>ANSI A137.1</td><td>As indicated</td><td>V2</td></tr></table>`;
    const specs = parseTechSpecsFromHtml(html);
    assert.equal(specs.breakingStrength, "≥ 350 lbf");
    assert.equal(specs.shadeVariation, "v2");
  });

  it("keeps Complies and V2 from the product line, not a comparison chart", () => {
    const html = `<div class="product-specs__item"><span>Thickness:</span><span>8 mm</span></div>
      <div class="product-specs__item"><span>Breaking Strength (ASTM C648):</span><span>Complies</span></div>
      <div class="product-specs__item"><span>Shade Variation:</span><span>V2</span></div>
      <div class="product-specs__item"><span>D.C.O.F. (ANSI A326.3):</span><span>≥ 0.42 WET</span></div>
      <table><tr><td>Breaking Strength</td><td>≥275 lbf</td><td>≥300 lbf</td></tr>
      <tr><td>Breaking Strength Outdoor 2cm</td><td>2000 lbf</td><td>≥2500 lbf</td></tr></table>`;
    const specs = parseTechSpecsFromHtml(html);
    assert.equal(specs.thickness, "8mm");
    assert.equal(specs.breakingStrength, "complies");
    assert.equal(specs.shadeVariation, "v2");
    assert.equal(specs.dcof, "≥ 0.42 wet");
  });

  it("uses the common collection thickness, not one deco sku", () => {
    const cards = Array.from({ length: 6 }, () => `<div><p>Thickness:</p><p>MM 10</p></div>`).join("");
    const deco = `<div><p>Thickness:</p><p>MM 13,5</p></div>`;
    const specs = parseTechSpecsFromHtml(`<body>${cards}${deco}</body>`);
    assert.equal(specs.thickness, "10mm");
  });

  it("reads a one-cell spec row", () => {
    const html = `<table>
      <tr><td><strong>Thickness:</strong> 0.34</td></tr>
      <tr><td><strong>Variation:</strong> V4 (Substantial)</td></tr>
      <tr><td><strong>DCOF:</strong> ? 0.42</td></tr>
      <tr><td><strong>Slip resistance:</strong> R10</td></tr>
    </table>`;
    const specs = parseTechSpecsFromHtml(html);
    assert.equal(specs.thickness, '0.34"');
    assert.equal(specs.shadeVariation, "v4");
    assert.equal(specs.dcof, "0.42 · R10");
  });

  it("reads a sku spec block that prints variation, slip, and inch thickness", () => {
    const html = `<div><p>Thickness:</p><p>0.34</p></div>
      <div><p>Variation:</p><p>V4 (Substantial)</p></div>
      <div><p>Slip resistance:</p><p>R10</p></div>
      <div><p>DCOF:</p><p>? 0.42</p></div>`;
    const specs = parseTechSpecsFromHtml(html);
    assert.equal(specs.thickness, '0.34"');
    assert.equal(specs.shadeVariation, "v4");
    assert.equal(specs.dcof, "0.42 · R10");
  });

  it("does not treat separate v ratings as a printed range", () => {
    const dropped = groundTechSpecs(
      { shadeVariation: "v2-v3", breakingStrength: "≥ 250 lbs", thickness: "13.5mm" },
      "Thickness MM 10 breaking strength is not listed. v2 appears in another collection.",
    );
    assert.equal(dropped.shadeVariation, undefined);
    assert.equal(dropped.breakingStrength, undefined);
    assert.equal(dropped.thickness, undefined);
    const kept = groundTechSpecs(
      { breakingStrength: "≥ 350 lbf" },
      "Breaking strength ASTM C648 ≥ 125 lbf ≥350 lbf",
    );
    assert.equal(kept.breakingStrength, "≥ 350 lbf");
  });
});
