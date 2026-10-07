import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractListedFormats, meshSheetFromHtml } from "./listed-sizes";
import { parseSizeLabel, sizeChartLabel } from "./size-format";

const ROCA = `<html><body>
<nav><a href="/blogs/all/now-available-in-48x48">Now Available in 48x48</a></nav>
<h1>Origin</h1>
<div><h3>CLOUD BG</h3><p>4X4<br>UORIGIN404U</p></div>
<div><h3>CLOUD BG</h3><p>3X6<br>UORIGIN306U<br>3X12<br>UORIGIN312U</p></div>
<p>Thickness 7mm (3x6)</p>
</body></html>`;

const ATLAS = `<table>
<tr><td>Details</td><td>4x4 Mosaics</td><td>Trapezoid Mosaics</td></tr>
<tr><td>Size (Nominal)</td><td>4"x4"</td><td>Trapezoids</td></tr>
<tr><td>Size (Actual)</td><td>12" x 12"</td><td>11.61"x11.61"</td></tr>
<tr><td>Thickness</td><td>9mm</td><td>9mm</td></tr>
</table>
<p>Size: 12"x12" Mesh-Mounted</p>`;

const AURA = `<html><body>
<img src="https://cdn.example/Aura_Puro_20x20.jpg" alt="Puro" />
<img src="https://cdn.example/Aura_Puro_7_5x40.jpg" alt="Puro glossy" />
<img src="https://cdn.example/Aura_Bathroom_1600x1200.jpg" alt="bathroom" />
<p>Choose sample size: Chip 4"x4" to 8"x8"</p>
<blog-post-card><a href="/blogs/all/new-england-now-available-in-48x48">Now Available in 48x48</a></blog-post-card>
</body></html>`;

describe("listed sizes", () => {
  it("keeps every card size on a wall collection and drops sizes that are not listed", () => {
    const formats = extractListedFormats(ROCA).map((f) => parseSizeLabel(f.raw)?.label);
    assert.deepEqual(formats, ['4"x4"', '3"x6"', '3"x12"']);
  });

  it("pairs a mosaic chip with its mesh sheet", () => {
    const formats = extractListedFormats(ATLAS);
    const labels = formats.map((f) =>
      sizeChartLabel({
        label: parseSizeLabel(f.raw)?.label ?? f.raw,
        sheetLabel: f.sheetRaw,
      }),
    );
    assert.deepEqual(labels, [
      '4"x4" mosaic (12"x12" sheet)',
      'trapezoid mosaic (12"x12" sheet)',
    ]);
    assert.equal(meshSheetFromHtml(ATLAS), '12"x12"');
  });

  it("does not treat a shopify file hash as part of the tile size", () => {
    const html = `<img src="https://cdn.example/Aura_Desert_Matt_7_5x40_22106626-b9bc.jpg" alt="Desert matt" />
<img src="https://cdn.example/Aura_Slate_7_5x40_25444372-6019.jpg" alt="Slate" />
<img src="https://cdn.example/Aura_Puro_20x20_b120fb24.jpg" alt="Puro" />`;
    const labels = extractListedFormats(html).map((f) => parseSizeLabel(f.raw)?.label);
    assert.deepEqual(labels.sort(), ['3"x16"', '8"x8"']);
  });

  it("reads nominal sizes from swatch filenames and ignores samples and news", () => {
    const labels = extractListedFormats(AURA).map((f) => parseSizeLabel(f.raw)?.label);
    assert.deepEqual(labels.sort(), ['3"x16"', '8"x8"']);
  });
});
