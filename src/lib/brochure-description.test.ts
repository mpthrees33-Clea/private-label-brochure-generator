import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderDescription } from "./brochure-description";

describe("description name substitution", () => {
  it("replaces the token and a leaked product name, not a descriptive or color use", () => {
    const text = renderDescription(
      "{{name}} is a watercolor-look porcelain. Watercolor combines soft hues. Watercolor Denim stays a color.",
      "Halden",
      "Watercolor",
    );
    assert.match(text, /^halden is a watercolor-look porcelain/);
    assert.match(text, /halden combines soft hues/);
    assert.match(text, /Watercolor Denim stays a color/);
    assert.equal(/halden denim/i.test(text), false);
  });
});
