import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractCatalog } from "./catalog";
import { factoryFromUrl } from "../factories";
import { brochureWarnings, missingBrochureFields } from "../brochure-quality";
import { applyColorPage, applyDecorFragment, followPlan } from "./linked-pages";
import { finalizeScrapedProduct } from "./normalize";
import { isJunkImage } from "../image-sniff";
import { sizeAvailable, sizeChartLabel } from "./size-format";
import type { BrochureData } from "../brochure-types";
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

const ROCA_HTML = `<html><body>
<nav><a href="/blogs/all/now-available-in-48x48">Now Available in 48x48</a></nav>
<h1>Origin</h1>
<div><h3>CLOUD</h3><p>4X4<br>UORIGIN404U</p></div>
<div><h3>MOSS</h3><p>3X6<br>UORIGIN306U<br>3X12<br>UORIGIN312U</p></div>
<p>Thickness 7mm (3x6)</p>
</body></html>`;

const ATLAS_HTML = `<html><body>
<table>
<tr><td>Details</td><td>4x4 Mosaics</td><td>Trapezoid Mosaics</td></tr>
<tr><td>Size (Nominal)</td><td>4"x4"</td><td>Trapezoids</td></tr>
<tr><td>Size (Actual)</td><td>12" x 12"</td><td>11.61"x11.61"</td></tr>
<tr><td>Thickness</td><td>9 mm</td><td>9 mm</td></tr>
<tr><td>Color Variation</td><td>V3</td><td>V3</td></tr>
<tr><td>Water Absorption (C373)</td><td>&gt; 15%</td><td>&gt; 15%</td></tr>
<tr><td>Chemical Resistance (C650)</td><td>Class B</td><td>Class B</td></tr>
</table>
<p>Size: 12"x12" Mesh-Mounted</p>
</body></html>`;

const AURA_HTML = `<html><body>
<p>gloss and matt brick tiles alongside 3D decor</p>
<img src="https://cdn.example/Aura_Lagoon_DeepGlaze_20x20.jpg" alt="Lagoon deep glaze" />
<img src="https://cdn.example/Aura_Lagoon_Glossy_7_5x40.jpg" alt="Lagoon glossy" />
<img src="https://cdn.example/Aura_Lagoon_Matt_7_5x40.jpg" alt="Lagoon matt" />
<img src="https://cdn.example/Aura_Puro_20x20.jpg" alt="Puro" />
<img src="https://cdn.example/Aura_Bathroom_1600x1200.jpg" alt="bathroom scene" />
<p>Choose sample size: Chip 4"x4" to 8"x8"</p>
<blog-post-card><a href="/blogs/all/new-england-now-available-in-48x48">Now Available in 48x48</a></blog-post-card>
</body></html>`;

describe("listed factory formats", () => {
  it("replaces an invented wall size with every size printed on the page", () => {
    const product = finalizeScrapedProduct(
      emptyProduct({
        factory: "Roca",
        factoryName: "Origin",
        factoryUrl: "https://rocatileusa.com/collections/origin",
        suggestedTrinityName: "ashford",
        sizes: [{ label: "12x24", iconKind: "rectangle" }],
        colors: [{ name: "Cloud", imageUrl: "https://cdn.example/cloud.jpg" }],
        availability: { Cloud: ["12x24"] },
        techSpecs: {
          thickness: "9mm",
          shadeVariation: "v3",
          waterAbsorption: "> 15%",
          chemicalResistance: "class b",
        },
      }),
      {
        pageHtml: ROCA_HTML,
        pageTitle: "Origin",
        sourceText: "Origin ceramic wall tile\nThickness 7mm (3x6)",
      },
    );
    assert.deepEqual(
      product.sizes.map((s) => s.label),
      ['4"x4"', '3"x6"', '3"x12"'],
    );
    assert.equal(product.sizes.find((s) => s.label === '3"x6"')?.thickness, "7mm");
    assert.equal(product.techSpecs.thickness, undefined);
    assert.equal(product.techSpecs.shadeVariation, undefined);
    assert.equal(product.techSpecs.waterAbsorption, undefined);
    assert.equal(product.techSpecs.chemicalResistance, undefined);
    assert.equal(product.colors.some((c) => c.decoImageUrl), false);
  });

  it("keeps Florida Tile catalog sizes when the raw page is also passed", () => {
    const catalog = extractCatalog(FLUENT_HTML, "https://floridatile.com/products/fluent/");
    const product = finalizeScrapedProduct(
      emptyProduct({ factoryUrl: "https://floridatile.com/products/fluent/" }),
      {
        catalog,
        pageHtml: FLUENT_HTML,
        pageTitle: "Fluent - Ceramic Wall Tile | Florida Tile",
        sourceText: catalog.text,
      },
    );
    assert.deepEqual(
      product.sizes.map((s) => s.label),
      ['4"x16"', '3"x12"', '3"x12" bullnose'],
    );
    assert.equal(product.techSpecs.dcof, undefined);
  });

  it("prints the mesh sheet on mosaic columns and keeps specs that are on the page", () => {
    const product = finalizeScrapedProduct(
      emptyProduct({
        factory: "Style Access",
        factoryName: "Atlas",
        factoryUrl: "https://style-access.com/atlas/",
        suggestedTrinityName: "atlas",
        sizes: [
          { label: "4x4 mosaic", iconKind: "mosaic" },
          { label: "trapezoid mosaic", iconKind: "mosaic" },
        ],
        colors: [{ name: "Alabaster", imageUrl: "https://cdn.example/alabaster.jpg" }],
        availability: { Alabaster: ["4x4 mosaic", "trapezoid mosaic"] },
        techSpecs: {
          thickness: "9mm",
          shadeVariation: "v3",
          waterAbsorption: "> 15%",
          chemicalResistance: "class b",
        },
      }),
      { pageHtml: ATLAS_HTML, pageTitle: "Atlas", sourceText: "Atlas mosaics" },
    );
    assert.deepEqual(product.sizes.map((s) => sizeChartLabel(s)), [
      '4"x4" mosaic (12"x12" sheet)',
      'trapezoid mosaic (12"x12" sheet)',
    ]);
    assert.equal(product.techSpecs.thickness, "9mm");
    assert.equal(product.techSpecs.shadeVariation, "v3");
    assert.equal(product.techSpecs.waterAbsorption, "> 15%");
    assert.equal(product.techSpecs.chemicalResistance, "class b");
  });

  it("collapses finish variants and does not invent a deco the page does not show", () => {
    const finishes = ["Deep Glaze", "Glossy", "Matt"];
    const colors = ["AU 02 Lagoon", "AU 10 Puro"].flatMap((stem) =>
      finishes.map((finish) => ({
        name: `${stem} ${finish}`,
        imageUrl:
          finish === "Deep Glaze"
            ? `https://cdn.example/${stem.replace(/\s+/g, "_")}_20x20.jpg`
            : `https://cdn.example/${stem.replace(/\s+/g, "_")}_7_5x40.jpg`,
      })),
    );
    const product = finalizeScrapedProduct(
      emptyProduct({
        factory: "Del Conca USA",
        factoryName: "Aura",
        factoryUrl: "https://www.delconcausa.com/products/aura",
        suggestedTrinityName: "harbor",
        suggestedDescription: "{{name}} pairs gloss and matt brick tiles alongside 3D decor.",
        colors,
        sizes: [{ label: "48x48", iconKind: "rectangle" }],
        availability: {},
        techSpecs: {},
        finishLegend: [],
      }),
      { pageHtml: AURA_HTML, pageTitle: "Aura", sourceText: "Aura tile" },
    );
    assert.deepEqual(
      product.colors.map((c) => c.name),
      ["AU 02 Lagoon", "AU 10 Puro"],
    );
    assert.equal(product.colors.every((c) => !c.decoImageUrl), true);
    assert.deepEqual(product.finishLegend, ["glossy", "deep glaze", "matte"]);
    assert.deepEqual(
      product.sizes.map((s) => s.label).sort(),
      ['3"x16"', '8"x8"'],
    );
    assert.equal(product.sizes.some((s) => /48/.test(s.label)), false);
    const lagoon = product.availabilityFinishes?.["au 02 lagoon"];
    assert.deepEqual(lagoon?.['8"x8"'], ["deep glaze"]);
    assert.deepEqual(lagoon?.['3"x16"'], ["glossy", "matte"]);
  });
});

describe("factory hosts", () => {
  it("recognizes the live MIR Mosaic and Caesar USA domains", () => {
    assert.equal(factoryFromUrl("https://mir-mosaic.com/collections/atlas")?.display, "MIR Mosaic");
    assert.equal(factoryFromUrl("https://www.mirmosaic.com/products/a")?.display, "MIR Mosaic");
    assert.equal(
      factoryFromUrl("https://caesarceramicsusa.com/collections/a")?.display,
      "Caesar USA",
    );
    assert.equal(factoryFromUrl("https://www.caesarusa.com/a")?.display, "Caesar USA");
  });
});

describe("tech spec gate", () => {
  it("warns when specs are thin and still allows the rest of the brochure", () => {
    const data = {
      trinityName: "harbor",
      trinityTagline: "glazed ceramic",
      description: "{{name}} is a glazed ceramic wall tile for interior walls.",
      heroImageUrl: "https://cdn.example/hero.jpg",
      colors: [{ trinityName: "lagoon", imageUrl: "https://cdn.example/lagoon.jpg", decoImageUrl: null }],
      sizes: [{ label: '3"x16"', iconKind: "plank" as const, isDeco: false }],
      availability: { lagoon: ['3"x16"'] },
      finishLegend: [],
      footnotes: [],
      techSpecs: {},
    } satisfies BrochureData;
    assert.deepEqual(missingBrochureFields(data), []);
    assert.deepEqual(brochureWarnings(data), ["tech-specs"]);
    assert.deepEqual(brochureWarnings({ ...data, techSpecs: { thickness: "7mm" } }), ["tech-specs"]);
    assert.deepEqual(
      brochureWarnings({
        ...data,
        techSpecs: {
          thickness: "7mm",
          shadeVariation: "v4",
          waterAbsorption: "≤ 7%",
          breakingStrength: "≥ 125 lbf",
        },
      }),
      [],
    );
  });
});

describe("structure decos and linked pages", () => {
  it("attaches a 3D image to every color the page shows one for", () => {
    const html = `
      <div><div class="ratio"><img src="https://www.ragnousa.com/app/uploads/collezioni/look-rdve/a.jpg" /></div><p>Amaranto</p></div>
      <div><div class="ratio"><img src="https://www.ragnousa.com/app/uploads/collezioni/look-corda/b.jpg" /></div><p>Corda</p></div>
      <div><div class="ratio"><img src="https://www.ragnousa.com/app/uploads/collezioni/look-giada/c.jpg" /></div><p>Giada</p></div>
      <div><div class="ratio"><img src="https://www.ragnousa.com/app/uploads/collezioni/look-oliva/d.jpg" /></div><p>Oliva</p></div>
      <div><div class="ratio"><img src="https://www.ragnousa.com/app/uploads/collezioni/look-rdv9/e.jpg" /></div><p>3d Maki Amaranto</p></div>
      <div><div class="ratio"><img src="https://www.ragnousa.com/app/uploads/collezioni/look-rdqm/f.jpg" /></div><p>3d Maki Corda</p></div>
      <div><div class="ratio"><img src="https://www.ragnousa.com/app/uploads/collezioni/look-rdqe/g.jpg" /></div><p>Yubi 3D Giada</p></div>
      <div><div class="ratio"><img src="https://www.ragnousa.com/app/uploads/collezioni/look-rcu5/h.jpg" /></div><p>Yubi 3D Oliva</p></div>`;
    const product = finalizeScrapedProduct(
      emptyProduct({
        factoryUrl: "https://www.ragnousa.com/collections/look-series/",
        colors: [
          { name: "Amaranto", imageUrl: "https://cdn.example/a.jpg" },
          { name: "Corda", imageUrl: "https://cdn.example/b.jpg" },
        ],
        sizes: [
          { label: '4"x4"', iconKind: "square" },
          { label: '4"x4"', iconKind: "square", isDeco: true },
        ],
      }),
      { pageHtml: html, pageTitle: "Look" },
    );
    const byName = Object.fromEntries(product.colors.map((color) => [color.name.toLowerCase(), color]));
    assert.ok(byName.amaranto.decoImageUrl?.includes("look-rdv9"));
    assert.ok(byName.corda.decoImageUrl?.includes("look-rdqm"));
    assert.ok(byName.giada.decoImageUrl?.includes("look-rdqe"));
    assert.ok(byName.oliva.decoImageUrl?.includes("look-rcu5"));
  });

  it("adds decor colors from a lazy tab", () => {
    const product = emptyProduct({
      colors: [{ name: "Ambient White", imageUrl: "https://cdn.example/white.jpg" }],
      sizes: [{ label: '2.75"x11"', iconKind: "rectangle" }],
    });
    applyDecorFragment(
      product,
      `<div><img src="/media/Color-Mix.jpg" /><strong>8"x8"</strong><p>Thickness 8 mm COLOR MIX Soft</p></div>`,
      "https://www.panaria.us/products/collection/playlist",
    );
    assert.ok(product.colors.some((color) => color.name.toLowerCase() === "color mix"));
    assert.ok(product.sizes.some((size) => size.isDeco && size.label === '8"x8"'));
  });

  it("replaces a nameless mosaic size with the inches printed on the sku page", () => {
    const product = emptyProduct({
      colors: [{ name: "Black", imageUrl: "https://cdn.example/black.jpg" }],
      sizes: [{ label: "mosaic field", iconKind: "mosaic" }],
    });
    assert.equal(followPlan("<p>mosaic field</p>", product), "sizes");
    applyColorPage(
      product,
      "Black",
      `<table><tr><td>Chip Size (inches): 7.87x7.87</td></tr><tr><td>Chip Size (mm): 200x200</td></tr></table>`,
      "sizes",
      "https://mir-mosaic.com/product/celestial-black/",
    );
    assert.deepEqual(
      product.sizes.map((size) => size.label),
      ['7.87"x7.87" mosaic'],
    );
  });

  it("keeps a mosaic sheet listed on the color page", () => {
    const product = emptyProduct({
      colors: [{ name: "Alpine Verde", imageUrl: "https://cdn.example/a.jpg" }],
      sizes: [{ label: '24"x48"', iconKind: "rectangle" }],
    });
    applyColorPage(
      product,
      "Alpine Verde",
      `<table><tr><th>Code</th><th>Trim Piece</th><th>Size</th></tr>
        <tr><td>A</td><td>mosaic 2x2</td><td>12"x12"</td></tr>
        <tr><td>B</td><td>Bullnose</td><td>3"x24"</td></tr></table>`,
      "availability",
      "https://www.stonepeakceramics.com/product/classic-boutique-alpine-verde/",
    );
    const mosaic = product.sizes.find((size) => size.label.includes('2"x2"'));
    assert.equal(mosaic?.sheetLabel, '12"x12"');
    assert.ok(product.availability["alpine verde"]?.some((label) => label.includes("sheet")));
  });

  it("follows color pages when availability is only in a tooltip", () => {
    const product = emptyProduct({
      sizes: [{ label: '24"x48"', iconKind: "rectangle" }],
    });
    const html = `<div title="*Not all the sizes are available for each color">24''x48'', 12''x12''</div>`;
    assert.equal(followPlan(html, product), "availability");
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

describe("trims and shared mosaics", () => {
  it("puts base trims and stripe on a line and keeps the field size", () => {
    const html = `<h1>Moon</h1>
      <p>120x120 /48"x48" 60x120 /24"x48" R</p>
      <p>Battiscopa 9mm 7x80 /2 7/8"x32" 7x60 /2 7/8"x24" 3D Wall STRIPE 60x120 /24"x48"</p>`;
    const product = finalizeScrapedProduct(
      emptyProduct({
        factoryName: "Moon",
        suggestedTrinityName: "keene",
        colors: [{ name: "Eclipse", imageUrl: "https://cdn.example/eclipse.jpg" }],
        sizes: [{ label: '24"x48"', iconKind: "rectangle" }],
        availability: { Eclipse: ['24"x48"'] },
      }),
      { pageHtml: html, pageTitle: "Moon", sourceText: "Moon tile" },
    );
    const labels = product.sizes.map((size) => size.label);
    assert.ok(labels.includes('24"x48"'));
    assert.equal(labels.some((label) => /base/.test(label)), false);
    assert.ok(product.specialPieces?.some((piece) => /base/.test(piece) && /32/.test(piece)));
    assert.ok(product.specialPieces?.some((piece) => /base/.test(piece) && /24/.test(piece)));
    assert.ok(product.specialPieces?.some((piece) => /stripe/.test(piece) && /24/.test(piece) && /48/.test(piece)));
  });

  it("checks both mosaics for every color when the count matches", () => {
    const html = `<p>Decors 2"x2" Mosaic (4) 2"x6.5" Stretch Mosaic (4) SILK JUTE WOOL LEATHER
      Trim pieces 3" x 24" Bullnose 6"x12" Covebase</p>`;
    const product = finalizeScrapedProduct(
      emptyProduct({
        factoryName: "Bond",
        suggestedTrinityName: "keene",
        colors: [
          { name: "Silk", imageUrl: "https://cdn.example/silk.jpg" },
          { name: "Jute", imageUrl: "https://cdn.example/jute.jpg" },
          { name: "Wool", imageUrl: "https://cdn.example/wool.jpg" },
          { name: "Leather", imageUrl: "https://cdn.example/leather.jpg" },
        ],
        sizes: [
          { label: '2"x2" mosaic', iconKind: "mosaic" },
          { label: '2"x6.5" mosaic', iconKind: "mosaic" },
        ],
        availability: {
          Silk: ['2"x2" mosaic', '2"x6.5" mosaic'],
          Jute: ['2"x6.5" mosaic'],
          Wool: ['2"x2" mosaic', '2"x6.5" mosaic'],
          Leather: ['2"x2" mosaic', '2"x6.5" mosaic'],
        },
      }),
      { pageHtml: html, pageTitle: "Bond", sourceText: "Bond porcelain" },
    );
    assert.ok(product.availability.jute?.some((label) => label.includes('2"x2"')));
    assert.ok(product.sizes.some((size) => /bullnose/.test(size.label)));
    assert.ok(product.sizes.some((size) => /covebase/.test(size.label)));
  });

  it("keeps printed base inches and puts a following trim name on the line", () => {
    const html = `<h1>Moon</h1><p>Battiscopa 9mm 7x80 /2 ⅞&rdquo;x32&rdquo; 7x60 /2 ⅞&rdquo;x24&rdquo;</p>
      <p>Trim pieces 33x60 cm 13&quot; x 23 5/8&quot; Scalino 7,2x60 cm 2 13/16&quot; x 23 5/8&quot; Battiscopa
      30x30 cm 12&quot; x 12&quot; Deco Composizione N (6) 3D Hexagons (6)</p>`;
    const product = finalizeScrapedProduct(
      emptyProduct({
        factoryName: "Alchemy",
        suggestedTrinityName: "keene",
        colors: [{ name: "Navy", imageUrl: "https://cdn.example/navy.jpg" }],
        sizes: [{ label: '24"x48"', iconKind: "rectangle" }],
        availability: { Navy: ['24"x48"'] },
      }),
      { pageHtml: html, pageTitle: "Alchemy", sourceText: "Alchemy tile" },
    );
    const pieces = product.specialPieces ?? [];
    assert.ok(pieces.some((piece) => /2 7\/8"x32" base/.test(piece)));
    assert.ok(pieces.some((piece) => /scalino/.test(piece) && /23/.test(piece)));
    assert.ok(pieces.some((piece) => /12"x12" deco/.test(piece)));
    assert.ok(pieces.some((piece) => /Composizione N/.test(piece)));
    assert.ok(pieces.some((piece) => /3D Hexagons/.test(piece)));
    assert.equal(product.sizes.some((size) => /scalino|base|deco/.test(size.label)), false);
  });
});
