import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractCatalog } from "./catalog";
import { finalizeScrapedProduct } from "./normalize";
import { isJunkImage } from "../image-sniff";
import { sizeAvailable, sizeChartLabel } from "./size-format";
import type { ScrapedProduct } from "./types";

const FLUENT_HTML = `<!doctype html><html><head>
<title>Fluent - Ceramic Wall Tile | Florida Tile</title>
<meta property="og:image" content="https://cdn.example/room_scenes/fluent_bath_slider.jpeg" />
</head><body>
<h1>Fluent</h1>
<p>Fluent ceramic wall tile is appropriate for most residential and commercial wall and backsplash applications.</p>
<h3 class="shape-name">Wall Tile (Glossy) - 4x16</h3>
<div>
  <img alt="White Glossy Wall Tile (Glossy) 4x16" src="https://cdn.example/fluent_white_4x16_glossy_v1jpg_larger.png" />
  <img alt="Cream Glossy Wall Tile (Glossy) 4x16" src="https://cdn.example/fluent_cream_4x16_glossy_v1jpg_larger.png" />
</div>
<h3 class="shape-name">Wall Tile (Matte) - 4x16</h3>
<div>
  <img alt="White Matte Wall Tile (Matte) 4x16" src="https://cdn.example/fluent_white_4x16_matte_v1jpg_larger.png" />
</div>
<h3 class="shape-name">Wall Tile (Glossy) - 3x12</h3>
<div>
  <img alt="White Glossy Wall Tile (Glossy) 3x12" src="https://cdn.example/fluent_white_3x12_glossy_v1jpg_larger.png" />
  <img alt="Cream Glossy Wall Tile (Glossy) 3x12" src="https://cdn.example/fluent_cream_3x12_glossy_v1jpg_larger.png" />
</div>
<p>Thickness 7mm (3x6) 7.8mm (3x12 &amp; 4x16)</p>
<table class="table">
  <thead><tr><th>Type</th><th>Shape</th><th>SKU</th><th>Size</th></tr></thead>
  <tbody>
    <tr><td>Bullnose</td><td></td><td>S43C9-FLT-Glossy</td><td>3x12</td></tr>
    <tr><td>Bullnose</td><td></td><td>S43C9-FLT-Matte</td><td>3x12</td></tr>
  </tbody>
</table>
<p>ANSI A326.3 N/A</p>
</body></html>`;

const ECLIPTA_HTML = `<!doctype html><html><head>
<title>Eclipta - Stone Look | Floor &amp; Wall Tile | Florida Tile</title>
<meta property="og:image" content="https://cdn.example/room_scenes/eclipta_living_slider.jpeg" />
</head><body>
<h1>Eclipta</h1>
<p>Inspired by Matera stone and the observers in Matera who looked at the stars.</p>
<h3 class="shape-name">Floor/Wall Tile (3D) - 12x24</h3>
<div><img alt="Halo Ivory Floor/Wall Tile (3D) 12x24" src="https://cdn.example/eclipta_halo_ivory_12x24_larger.png" /></div>
<h3 class="shape-name">Floor/Wall Tile (3D Plus) - 24x48</h3>
<div><img alt="Halo Ivory Floor/Wall Tile (3D Plus) 24x48" src="https://cdn.example/eclipta_halo_ivory_24x48_larger.png" /></div>
<h3 class="shape-name">Floor/Wall Tile (3D Plus Deco) - 24x48</h3>
<div><img alt="Halo Ivory Floor/Wall Tile (3D Plus Deco) 24x48" src="https://cdn.example/eclipta_halo_ivory_deco_24x48_larger.png" /></div>
</body></html>`;

function emptyProduct(over: Partial<ScrapedProduct> = {}): ScrapedProduct {
  return {
    factory: "Florida Tile",
    factoryName: "matera",
    factoryUrl: "https://floridatile.com/products/eclipta/",
    suggestedTrinityName: "matera",
    suggestedTagline: "color body porcelain",
    suggestedDescription: "{{name}} is a stone look porcelain.",
    heroImageUrl: "",
    colors: [],
    sizes: [],
    availability: {},
    techSpecs: { dcof: "≥ 0.42 wet" },
    finishLegend: ["matte"],
    footnotes: [],
    ...over,
  };
}

describe("wall tile catalog", () => {
  it("collapses finish headings into nominal inch sizes", () => {
    const catalog = extractCatalog(FLUENT_HTML, "https://floridatile.com/products/fluent/");
    const product = finalizeScrapedProduct(emptyProduct({ factoryUrl: "https://floridatile.com/products/fluent/" }), {
      catalog,
      pageTitle: "Fluent - Ceramic Wall Tile | Florida Tile",
      sourceText: catalog.text,
    });
    assert.equal(product.factoryName, "Fluent");
    assert.deepEqual(
      product.sizes.map((s) => `${s.label}|${s.iconKind}|${s.isDeco ? "deco" : ""}`),
      [
        '4"x16"|plank|',
        '3"x12"|plank|',
        '3"x12" bullnose|bullnose|',
      ],
    );
    assert.equal(product.sizes.find((s) => s.label === '4"x16"')?.thickness, "7.8mm");
    assert.equal(product.sizes.find((s) => s.label === '3"x12"')?.thickness, "7.8mm");
    const names = product.colors.map((c) => c.name);
    assert.deepEqual(names, ["White", "Cream"]);
    assert.equal(product.availability.cream.includes('4"x16"'), true);
    assert.deepEqual(product.availabilityFinishes?.cream?.['4"x16"'], ["glossy"]);
    assert.equal(product.availabilityFinishes?.white?.['4"x16"'], undefined);
    assert.equal(product.techSpecs.dcof, undefined);
    assert.ok(product.footnotes.some((f) => /wall tile/i.test(f)));
    assert.equal(product.heroImageUrl.includes("room_scenes"), true);
    assert.equal(product.colors[0].imageUrl.includes("_larger"), true);
  });
});

describe("field and deco pairing", () => {
  it("keeps one color and one deco column for Eclipta-style lines", () => {
    const catalog = extractCatalog(ECLIPTA_HTML, "https://floridatile.com/products/eclipta/");
    const product = finalizeScrapedProduct(emptyProduct(), {
      catalog,
      pageTitle: "Eclipta - Stone Look | Floor & Wall Tile | Florida Tile",
      sourceText: "Inspired by Matera stone. " + catalog.text,
    });
    assert.equal(product.factoryName, "Eclipta");
    assert.equal(product.suggestedTrinityName, "");
    assert.deepEqual(
      product.colors.map((c) => c.name),
      ["Halo Ivory"],
    );
    assert.ok(product.colors[0].imageUrl.includes("12x24"));
    assert.ok(product.colors[0].decoImageUrl?.includes("deco"));
    const labels = product.sizes.map((s) => sizeChartLabel(s));
    assert.deepEqual(labels, ['12"x24"', '24"x48"', '24"x48" deco']);
    assert.equal(labels.filter((l) => /deco deco/i.test(l)).length, 0);
    assert.equal(product.footnotes.some((f) => /not for floors/i.test(f)), false);
  });

  it("does not print deco twice when the label already says deco", () => {
    const label = sizeChartLabel({ label: '24"x48" deco', isDeco: true });
    assert.equal(label, '24"x48" deco');
    assert.equal(
      sizeAvailable(
        { label: '12"x24"', isDeco: true },
        ['12"x24"', '12"x24" deco'],
      ),
      true,
    );
    assert.equal(
      sizeAvailable({ label: '12"x24"', isDeco: false }, ['12"x24" deco']),
      false,
    );
  });

  it("merges a deco color the model returned as its own swatch", () => {
    const product = finalizeScrapedProduct(
      emptyProduct({
        factoryName: "Eclipta",
        suggestedTrinityName: "ashland",
        colors: [
          { name: "Halo Ivory", imageUrl: "https://cdn.example/field.jpg" },
          { name: "Halo Ivory Deco", imageUrl: "https://cdn.example/deco.jpg" },
        ],
        sizes: [
          { label: "24x48 deco", iconKind: "rectangle", isDeco: true },
          { label: "Wall Tile (Glossy) - 3x12", iconKind: "rectangle" },
          { label: "Wall Tile (Matte) - 3x12", iconKind: "rectangle" },
        ],
        availability: {
          "Halo Ivory": ["24x48 deco", "Wall Tile (Glossy) - 3x12"],
          "Halo Ivory Deco": ["24x48 deco"],
        },
      }),
      { sourceText: "no matera here", pageTitle: "Eclipta" },
    );
    assert.equal(product.suggestedTrinityName, "ashland");
    assert.equal(product.colors.length, 1);
    assert.equal(product.colors[0].decoImageUrl, "https://cdn.example/deco.jpg");
    assert.deepEqual(
      product.sizes.map((s) => sizeChartLabel(s)),
      ['24"x48" deco', '3"x12"'],
    );
    assert.equal(product.sizes.find((s) => s.label === '3"x12"')?.iconKind, "plank");
  });
});

describe("image urls", () => {
  it("does not treat a nominal size like 11x12 as a 1x1 placeholder", () => {
    const url =
      "https://cdn.example/eclipta_arc_stack_mosaic_lunar_white_11x12_larger.png";
    assert.equal(isJunkImage(url, "Lunar White Arcadia Stack Mosaic (3D) 11x12"), false);
    assert.equal(isJunkImage("https://cdn.example/spacer.gif", ""), true);
  });
});

describe("metric wall sizes", () => {
  it("converts cm nominals to the inch chart", () => {
    const product = finalizeScrapedProduct(
      emptyProduct({
        factoryName: "Rapolano Wall",
        suggestedTrinityName: "keene",
        sizes: [{ label: "40x120cm", iconKind: "rectangle" }],
        colors: [{ name: "Bianco", imageUrl: "https://cdn.example/bianco.jpg" }],
        availability: { Bianco: ["40x120cm"] },
      }),
      { pageTitle: "Rapolano Wall", sourceText: "Rapolano wall tile 40x120cm" },
    );
    assert.equal(product.sizes[0].label, '16"x48"');
    assert.equal(product.sizes[0].iconKind, "rectangle");
  });
});
