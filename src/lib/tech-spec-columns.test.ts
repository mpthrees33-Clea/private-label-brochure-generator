import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { visibleTechSpecColumns } from "./tech-spec-columns";

const FLUENT: Parameters<typeof visibleTechSpecColumns>[0] = {
  thickness: "7mm / 7.8mm",
  shadeVariation: "v1",
  waterAbsorption: "14.8% – 17.1%",
  scratchHardness: "5",
  breakingStrength: "≥ 150 lbf",
};

const ECLIPTA: Parameters<typeof visibleTechSpecColumns>[0] = {
  thickness: "9mm",
  shadeVariation: "v3",
  waterAbsorption: "≤ 0.5%",
  scratchHardness: "7",
  breakingStrength: "≥ 400 lbf",
  dcof: "≥ 0.42 wet",
};

describe("tech spec headers", () => {
  it("puts the test method in the header and does not invent a dash row", () => {
    for (const specs of [FLUENT, ECLIPTA]) {
      const columns = visibleTechSpecColumns(specs);
      const headers = columns.map((c) => c.header);
      assert.equal(headers.includes("-"), false);
      assert.equal(
        headers.some((h) => h === "c373" || h === "mohs" || h === "a326.3"),
        false,
      );
      assert.equal(headers[0], "nominal thickness");
      assert.equal(headers[1], "shade variation");
      assert.ok(headers.includes("water absorption (ASTM C373)"));
      assert.ok(headers.includes("scratch hardness (Mohs)"));
      assert.ok(headers.includes("breaking strength (ASTM C648)"));
    }
  });

  it("includes ANSI A326.3 on porcelain lines and omits an empty dcof on wall tile", () => {
    const fluent = visibleTechSpecColumns(FLUENT).map((c) => c.key);
    const eclipta = visibleTechSpecColumns(ECLIPTA);
    assert.equal(fluent.includes("dcof"), false);
    const dcof = eclipta.find((c) => c.key === "dcof");
    assert.equal(dcof?.header, "dynamic coefficient of friction (ANSI A326.3)");
  });

  it("prints the standard the factory cited instead of the ASTM template", () => {
    const columns = visibleTechSpecColumns(
      { frostResistance: "resistant", waterAbsorption: "≤ 0.5%" },
      { frostResistance: "UNI EN ISO 10545.12", waterAbsorption: "ISO 10545-3" },
    );
    const headers = columns.map((column) => column.header);
    assert.ok(headers.includes("frost resistance (UNI EN ISO 10545.12)"));
    assert.ok(headers.includes("water absorption (ISO 10545-3)"));
    assert.equal(headers.some((header) => /ASTM/.test(header)), false);
  });
});
