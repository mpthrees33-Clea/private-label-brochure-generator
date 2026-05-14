import type { BrochureData } from "./brochure-types";

/**
 * Hardcoded Kendall data extracted from
 * Trinity-Tile-Kendall-Brochure.pdf — used to develop the brochure
 * renderer against a known good reference. Replace image URLs with
 * real CDN URLs once we have them; placeholder paths point at local
 * /public/sample/* so the page renders without network calls.
 */
export const KENDALL_SAMPLE: BrochureData = {
  trinityName: "kendall",
  trinityTagline: "thru color porcelain tile, made in usa",
  description:
    "Industrial inspiration meets modern sophistication. Kendall captures the raw elegance of poured concrete with soft gradients, subtle texture, and five refined neutrals—delivering minimalist beauty and elevated design in versatile formats including 12x24 field and deco, 6x24 plank, mosaic, and bullnose.",
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
    dcof: "≥ 0.42, IW+",
  },
};
