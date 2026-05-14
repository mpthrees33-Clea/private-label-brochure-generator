import type { BrochureData } from "./brochure-types";

/**
 * Hardcoded data extracted from the 4 reference Trinity brochures —
 * used to develop the renderer against known-good output AND to seed
 * the crossover so the rep has the existing catalog to start from.
 * Image URLs point at /public/sample/* (only Kendall has real images
 * for now; the others render gray placeholders until uploaded).
 */
export const KENDALL_SAMPLE: BrochureData = {
  trinityName: "kendall",
  trinityTagline: "thru color porcelain tile, made in usa",
  description:
    "Industrial inspiration meets modern sophistication. {{name}} captures the raw elegance of poured concrete with soft gradients, subtle texture, and five refined neutrals—delivering minimalist beauty and elevated design in versatile formats including 12x24 field and deco, 6x24 plank, mosaic, and bullnose.",
  heroImageUrl: "/sample/kendall-hero.jpg",
  colors: [
    {
      trinityName: "white",
      imageUrl: "/sample/kendall-white.jpg",
      decoImageUrl: "/sample/kendall-white-deco.jpg",
    },
    {
      trinityName: "beige",
      imageUrl: "/sample/kendall-beige.jpg",
      decoImageUrl: "/sample/kendall-beige-deco.jpg",
    },
    {
      trinityName: "gray",
      imageUrl: "/sample/kendall-gray.jpg",
      decoImageUrl: "/sample/kendall-gray-deco.jpg",
    },
    {
      trinityName: "greige",
      imageUrl: "/sample/kendall-greige.jpg",
      decoImageUrl: "/sample/kendall-greige-deco.jpg",
    },
    {
      trinityName: "black",
      imageUrl: "/sample/kendall-black.jpg",
      decoImageUrl: "/sample/kendall-black-deco.jpg",
    },
  ],
  sizes: [
    { label: '12"x24"', iconKind: "rectangle" },
    { label: '12"x24"', iconKind: "rectangle", isDeco: true },
    { label: '6"x24"', iconKind: "plank" },
    { label: '12"x12" mosaic', iconKind: "mosaic" },
    { label: '3"x24" bullnose', iconKind: "bullnose" },
  ],
  availability: {
    white: ['12"x24"', '12"x24" deco', '6"x24"', '12"x12" mosaic', '3"x24" bullnose'],
    beige: ['12"x24"', '12"x24" deco', '6"x24"', '12"x12" mosaic', '3"x24" bullnose'],
    gray: ['12"x24"', '12"x24" deco', '6"x24"', '12"x12" mosaic', '3"x24" bullnose'],
    greige: ['12"x24"', '12"x24" deco', '6"x24"', '12"x12" mosaic', '3"x24" bullnose'],
    black: ['12"x24"', '12"x24" deco', '6"x24"', '12"x12" mosaic', '3"x24" bullnose'],
  },
  finishLegend: ["matte"],
  footnotes: [],
  techSpecs: {
    thickness: "8mm",
    shadeVariation: "v3",
    waterAbsorption: "≤ 0.5%",
    frostResistance: "resistant",
    stainResistance: "resistant",
    chemicalResistance: "resistant",
    scratchHardness: "7",
    breakingStrength: "≥ 450 lbf",
    dcof: "≥ 0.42 wet",
  },
};

export const LUNETT_SAMPLE: BrochureData = {
  trinityName: "lunett",
  trinityTagline: "thru color rectified porcelain tile, made in usa",
  description:
    "{{name}} is a refined porcelain collection inspired by the quiet elegance of moonlight and the natural beauty of stone. Featuring five soft colors and multiple sizes, it blends Ceppo di Gré, Fior di Bosco, and Moonstone into a calm, sophisticated palette—enhanced by built-in antimicrobial technology.",
  heroImageUrl: "",
  colors: [
    { trinityName: "white", imageUrl: "" },
    { trinityName: "taupe", imageUrl: "" },
    { trinityName: "beige", imageUrl: "" },
    { trinityName: "gray", imageUrl: "" },
    { trinityName: "dark gray", imageUrl: "" },
  ],
  sizes: [
    { label: '24"x48"', iconKind: "rectangle", thickness: "9mm" },
    { label: '24"x48" paver', iconKind: "rectangle", thickness: "20mm" },
    { label: '36"x36"', iconKind: "square" },
    { label: '12"x24"', iconKind: "rectangle" },
    { label: '12"x14" trapezoid mosaic', iconKind: "mosaic" },
    { label: '4"x24" bullnose', iconKind: "bullnose" },
  ],
  availability: {
    white: ['24"x48"', '24"x48" paver', '36"x36"', '12"x24"', '12"x14" trapezoid mosaic', '4"x24" bullnose'],
    taupe: ['24"x48"', '24"x48" paver', '36"x36"', '12"x24"', '12"x14" trapezoid mosaic', '4"x24" bullnose'],
    beige: ['24"x48"', '24"x48" paver', '36"x36"', '12"x24"', '12"x14" trapezoid mosaic', '4"x24" bullnose'],
    gray: ['24"x48"', '24"x48" paver', '36"x36"', '12"x24"', '12"x14" trapezoid mosaic', '4"x24" bullnose'],
    "dark gray": ['24"x48"', '24"x48" paver', '36"x36"', '12"x24"', '12"x14" trapezoid mosaic', '4"x24" bullnose'],
  },
  finishLegend: ["matte", "grip"],
  footnotes: [],
  techSpecs: {
    thickness: "9mm",
    shadeVariation: "v2",
    waterAbsorption: "≤ 0.5%",
    frostResistance: "resistant",
    stainResistance: "resistant",
    chemicalResistance: "resistant",
    scratchHardness: "7",
    breakingStrength: "≥ 450 lbf",
    dcof: "matte ≥ 0.42 wet | grip ≥ 0.42 wet",
  },
};

export const OBERLIN_SAMPLE: BrochureData = {
  trinityName: "oberlin",
  trinityTagline: "rectified porcelain tile + ceramic wall tile, made in italy",
  description:
    "{{name}} captures the quiet beauty of natural oak in a durable porcelain surface. Developed with seasoned wood experts, it begins with carefully selected oak references, reimagined through advanced ceramic technology to preserve every grain, knot, and nuance—offering warmth, authenticity, and a deep connection to nature.",
  heroImageUrl: "",
  colors: [
    { trinityName: "bright", imageUrl: "" },
    { trinityName: "icon", imageUrl: "" },
    { trinityName: "amber", imageUrl: "" },
    { trinityName: "deep", imageUrl: "" },
    { trinityName: "moon", imageUrl: "" },
    { trinityName: "bright rustic", imageUrl: "" },
    { trinityName: "icon rustic", imageUrl: "" },
    { trinityName: "amber rustic", imageUrl: "" },
    { trinityName: "deep rustic", imageUrl: "" },
    { trinityName: "moon rustic", imageUrl: "" },
  ],
  sizes: [
    { label: '48"x110"', iconKind: "rectangle", thickness: "6mm" },
    { label: '8"x70"', iconKind: "plank", thickness: "9.5mm" },
    { label: '7"x60"', iconKind: "plank", thickness: "9mm" },
    { label: '8"x48"', iconKind: "plank", thickness: "9mm" },
    { label: '24"x48" paver', iconKind: "rectangle", thickness: "20mm" },
    { label: '12"x48" paver', iconKind: "plank", thickness: "20mm" },
    { label: '3"x18" chevron', iconKind: "plank", thickness: "9mm" },
    { label: '3"x60" bullnose', iconKind: "bullnose" },
    { label: '3"x48" bullnose', iconKind: "bullnose" },
  ],
  availability: {
    bright: ['48"x110"', '8"x70"', '7"x60"', '8"x48"', '24"x48" paver', '3"x18" chevron', '3"x60" bullnose', '3"x48" bullnose'],
    icon: ['48"x110"', '8"x70"', '7"x60"', '8"x48"', '24"x48" paver', '3"x18" chevron', '3"x60" bullnose', '3"x48" bullnose'],
    amber: ['8"x70"', '7"x60"', '8"x48"', '3"x18" chevron', '3"x60" bullnose', '3"x48" bullnose'],
    deep: ['8"x70"', '7"x60"', '8"x48"', '3"x18" chevron', '3"x60" bullnose', '3"x48" bullnose'],
    moon: ['8"x70"', '7"x60"', '8"x48"', '3"x18" chevron', '3"x60" bullnose', '3"x48" bullnose'],
    "bright rustic": ['8"x70"', '7"x60"', '8"x48"', '12"x48" paver'],
    "icon rustic": ['8"x70"', '7"x60"', '8"x48"', '12"x48" paver'],
    "amber rustic": ['8"x70"', '7"x60"', '8"x48"', '12"x48" paver'],
    "deep rustic": ['8"x70"', '7"x60"', '8"x48"', '12"x48" paver'],
    "moon rustic": ['8"x70"', '7"x60"', '8"x48"', '12"x48" paver'],
  },
  finishLegend: ["matte", "grip"],
  footnotes: ['*ceramic wall tile only on select sizes (48"x110", 3"x18" chevron)'],
  techSpecs: {
    thickness: "6mm – 9.5mm",
    shadeVariation: "v2-v3",
    waterAbsorption: "≤ 0.1%",
    frostResistance: "resistant",
    stainResistance: "class 5",
    chemicalResistance: "class a",
    dcof: "matte ≥ 0.50 wet | grip ≥ 0.55 wet",
  },
};

export const TORRANCE_SAMPLE: BrochureData = {
  trinityName: "torrance",
  trinityTagline: "thru color rectified porcelain tile, made in usa",
  description:
    "{{name}} captures the essence of timeworn stone with a modern edge, blending intricate veining and tonal depth across four versatile neutrals. With soft, brushed surfaces and structured textures, this porcelain collection brings understated elegance and lasting performance.",
  heroImageUrl: "",
  colors: [
    { trinityName: "bianco", imageUrl: "", decoImageUrl: "" },
    { trinityName: "sabbia", imageUrl: "", decoImageUrl: "" },
    { trinityName: "grigio", imageUrl: "", decoImageUrl: "" },
    { trinityName: "nero", imageUrl: "", decoImageUrl: "" },
  ],
  sizes: [
    { label: '24"x48"', iconKind: "rectangle", thickness: "9.5mm" },
    { label: '12"x24"', iconKind: "rectangle", thickness: "8.5mm" },
    { label: '12"x24" deco', iconKind: "rectangle", thickness: "8.5mm", isDeco: true, footnoteRef: "*" },
    { label: '12"x12" mosaic', iconKind: "mosaic", thickness: "8.5mm" },
    { label: '3"x24" bullnose', iconKind: "bullnose" },
  ],
  availability: {
    bianco: ['24"x48"', '12"x24"', '12"x24" deco', '12"x12" mosaic', '3"x24" bullnose'],
    sabbia: ['24"x48"', '12"x24"', '12"x24" deco', '12"x12" mosaic', '3"x24" bullnose'],
    grigio: ['24"x48"', '12"x24"', '12"x24" deco', '12"x12" mosaic', '3"x24" bullnose'],
    nero: ['24"x48"', '12"x24"', '12"x24" deco', '12"x12" mosaic', '3"x24" bullnose'],
  },
  finishLegend: ["matte", "textured"],
  footnotes: ["*not recommended for floors"],
  techSpecs: {
    thickness: '9.5mm | 8.5mm',
    shadeVariation: "v3",
    waterAbsorption: "≤ 0.5%",
    frostResistance: "resistant",
    stainResistance: "class 5",
    chemicalResistance: "resistant",
    breakingStrength: "≥ 250 lbs",
    dcof: "≥ 0.50 wet",
  },
};
