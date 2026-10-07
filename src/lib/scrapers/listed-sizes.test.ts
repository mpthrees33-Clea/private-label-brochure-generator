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

describe("stated inches", () => {
  it("does not round a fractional inch the factory printed", () => {
    assert.equal(parseSizeLabel('2.75"x11"')?.label, '2.75"x11"');
    assert.equal(parseSizeLabel("7.87x7.87 in")?.label, '7.87"x7.87"');
  });

  it("keeps a nominal 4x4 and the printed inches for a size that does not snap", () => {
    assert.equal(parseSizeLabel('10x10cm (3 15/16" x 3 15/16")')?.label, '4"x4"');
    assert.equal(parseSizeLabel('6x24cm (2 3/8" x 9 7/16")')?.label, '2 3/8"x9 7/16"');
    assert.equal(parseSizeLabel('6x24cm (23/8"x97/16")')?.label, '2 3/8"x9 7/16"');
  });

  it("reads special pieces from a trim table", () => {
    const html = `<body class="avada-blog-layout-large"><table><thead><tr><th>Code</th><th>Size</th></tr></thead>
      <tr><td>USG2448367</td><td>24''x48''</td></tr></table>
      <table><thead><tr><th>Code</th><th>Trim Piece</th><th>Size</th></tr></thead><tbody>
      <tr><td>USP11ARC367</td><td></td><td>Arch Mosaic</td><td>11.5"x11.5"</td></tr>
      <tr><td>USP915BSKT367</td><td></td><td>Long Basketweave</td><td>9''x15''</td></tr>
      <tr><td>USP324BT367</td><td></td><td>Bullnose</td><td>3''x24''</td></tr>
      <tr><td>USG12MO367</td><td></td><td>mosaic 2x2</td><td>12''x12''</td></tr>
    </tbody></table></body>`;
    const formats = extractListedFormats(html);
    const labels = formats.map((format) => parseSizeLabel(format.raw)?.label);
    assert.deepEqual(labels, [
      '24"x48"',
      '11.5"x11.5" arch mosaic',
      '9"x15" basketweave',
      '3"x24" bullnose',
      '2"x2" mosaic',
    ]);
    const mosaic = formats.find((format) => /2x2/.test(format.raw));
    assert.equal(mosaic?.sheetRaw, '12"x12"');
  });

  it("keeps a chip size inside one table cell and ignores a pixel box", () => {
    const html = `<table>
      <tr><td><strong>Sheet Size:</strong> 7.87x7.87</td></tr>
      <tr><td><strong>Chip Size (inches):</strong> 7.87x7.87</td></tr>
      <tr><td><strong>Chip Size (mm):</strong> 200x200</td></tr>
    </table><p>150x150</p>`;
    const labels = extractListedFormats(html).map((format) => parseSizeLabel(format.raw)?.label);
    assert.deepEqual(labels.filter(Boolean), ['7.87"x7.87" mosaic', '8"x8" mosaic']);
    assert.equal(parseSizeLabel("150x150"), null);
    assert.equal(parseSizeLabel("24''x48''")?.label, '24"x48"');
  });

  it("reads a comma-separated size line and ignores a magazine headline", () => {
    const html = `<h1>Look</h1>
      <div>24''x48'', 24''x24'', 12''x24'', 12''x12''</div>
      <a href="/magazine/the-large-120x120-format">The large 120x120 format redefines the elegance of stoneplay stone</a>`;
    const labels = extractListedFormats(html).map((format) => parseSizeLabel(format.raw)?.label);
    assert.deepEqual(labels.sort(), ['12"x12"', '12"x24"', '24"x24"', '24"x48"']);
  });

  it("drops other collections in a lifestyle gallery and a unitless twin of a cm size", () => {
    const html = `<h1>Look</h1>
      <p>10x10cm (3 15/16"x3 15/16")</p>
      <p>6x24cm (2 3/8"x9 7/16")</p>
      <p>6x24</p>
      <div>
        <p>In this image</p>
        <p>LOOK BIANCO</p><p>Size:</p><p>10x10cm</p>
        <p>REALSTONE GREY</p><p>Size:</p><p>60x120cm</p>
      </div>`;
    const labels = extractListedFormats(html).map((format) => parseSizeLabel(format.raw)?.label);
    assert.ok(labels.includes('4"x4"'));
    assert.ok(labels.includes('2 3/8"x9 7/16"'));
    assert.equal(labels.includes('6"x24"'), false);
    assert.equal(labels.includes('24"x48"'), false);
  });
});

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
