import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BrochureColor } from "./brochure-types";
import { parseSizeLabel } from "./scrapers/size-format";
import { nominalAspectRatio, omitChipFieldSizes, resolveSwatchFaces, swatchFit } from "./swatch-geometry";

function ratioOf(label: string): number | null {
  const parsed = parseSizeLabel(label);
  if (!parsed) return null;
  return nominalAspectRatio(parsed.widthIn, parsed.heightIn);
}

describe("nominal size to frame ratio", () => {
  it("parses inches, centimeters, and both multiply signs", () => {
    assert.equal(ratioOf('8"x8"'), 1);
    assert.equal(ratioOf("20x20"), 1);
    assert.equal(ratioOf("20×20 cm"), 1);
    assert.equal(ratioOf("7.5x40"), nominalAspectRatio(3, 16));
    assert.equal(ratioOf("7.5×40cm"), nominalAspectRatio(3, 16));
    assert.equal(ratioOf('3"x16"'), nominalAspectRatio(3, 16));
    assert.equal(ratioOf("4x16"), 0.25);
    assert.equal(ratioOf('12"x24"'), 0.5);
    assert.equal(ratioOf("4x4 mosaic"), 1);
    assert.equal(ratioOf('4"x4" mosaic (12"x12" sheet)'), 1);
    assert.equal(ratioOf("670x210"), null);
  });

  it("does not let a wide factory crop change a square or a plank", () => {
    assert.equal(nominalAspectRatio(8, 8), 1);
    assert.equal(nominalAspectRatio(3, 16), nominalAspectRatio(3, 16));
    assert.ok((nominalAspectRatio(3, 16) ?? 0) > 1);
    assert.equal(nominalAspectRatio(4, 16), 0.25);
    assert.equal(nominalAspectRatio(12, 24), 0.5);
    assert.equal(nominalAspectRatio(undefined, undefined), null);
  });

  it("stores a square deco and a long plank on one color", () => {
    const color: BrochureColor = {
      trinityName: "au 10 puro",
      imageUrl: "https://cdn.example/puro-field.jpg",
      faces: [
        {
          imageUrl: "https://cdn.example/puro-20x20.jpg",
          finish: "deep glaze",
          widthIn: 8,
          heightIn: 8,
          aspectRatio: 1,
          photoWidth: 670,
          photoHeight: 210,
        },
        {
          imageUrl: "https://cdn.example/puro-7-5x40.jpg",
          finish: "glossy",
          widthIn: 3,
          heightIn: 16,
          aspectRatio: nominalAspectRatio(3, 16),
          photoWidth: 670,
          photoHeight: 210,
        },
        {
          imageUrl: "https://cdn.example/puro-matt.jpg",
          finish: "matte",
          widthIn: 3,
          heightIn: 16,
          aspectRatio: nominalAspectRatio(3, 16),
          photoWidth: 670,
          photoHeight: 210,
        },
      ],
    };
    const faces = resolveSwatchFaces(color);
    assert.equal(faces.length, 3);
    assert.equal(faces[0].ratio, 1);
    assert.equal(faces[0].sizeUnknown, false);
    assert.ok(faces[1].ratio > 1);
    assert.equal(faces[1].ratio, faces[2].ratio);
    assert.equal(faces[0].caption.includes("deep glaze"), true);
    assert.equal(faces[1].caption, "glossy");
    assert.equal(faces[0].photoMismatch, true);
    assert.equal(faces[1].photoMismatch, true);
  });

  it("marks a swatch size unknown instead of using a 1:2 frame", () => {
    const faces = resolveSwatchFaces({
      trinityName: "zelton",
      imageUrl: "https://cdn.example/zelton.jpg",
      faces: [{ imageUrl: "https://cdn.example/zelton.jpg", sizeUnknown: true, aspectRatio: null }],
    });
    assert.equal(faces[0].sizeUnknown, true);
    assert.equal(faces[0].ratio, 1);
    assert.notEqual(faces[0].ratio, 0.5);
  });

  it("contains a wide factory crop and crops a photo that already matches the tile", () => {
    assert.equal(swatchFit(1, 670, 210), "contain");
    assert.equal(swatchFit(16 / 3, 670, 210), "contain");
    assert.equal(swatchFit(16 / 3, 1200, 225), "cover");
    assert.equal(swatchFit(1, 1250, 1250), "cover");
    assert.equal(swatchFit(0.25, 400, 1600), "cover");
    assert.equal(swatchFit(2, 1080, 540), "cover");
    assert.equal(swatchFit(1, null, null, true), "contain");
  });

  it("does not treat a trapezoid face as the chart's 4x4", () => {
    const faces = resolveSwatchFaces(
      {
        trinityName: "alabaster",
        imageUrl: "https://cdn.example/4x4.jpg",
        faces: [
          { imageUrl: "https://cdn.example/4x4.jpg", widthIn: 4, heightIn: 4, aspectRatio: 1 },
          { imageUrl: "https://cdn.example/trap.jpg", sizeUnknown: true, aspectRatio: null },
        ],
      },
      [{ label: '4"x4"', iconKind: "square" }],
    );
    assert.equal(faces[1].sizeUnknown, true);
    assert.equal(faces[1].ratio, 1);
  });

  it("uses a trapezoid mosaic's 12x12 sheet as its nominal size", () => {
    const faces = resolveSwatchFaces(
      {
        trinityName: "alabaster",
        imageUrl: "https://cdn.example/4x4.jpg",
        faces: [
          { imageUrl: "https://cdn.example/4x4.jpg", widthIn: 4, heightIn: 4, aspectRatio: 1 },
          {
            imageUrl: "https://style-access.com/Alabaster-Trapesoid-Large.jpeg",
            sizeUnknown: true,
            aspectRatio: null,
          },
        ],
      },
      [
        { label: '4"x4"', iconKind: "square" },
        { label: "trapezoid mosaic", iconKind: "mosaic", sheetLabel: '12"x12"' },
      ],
    );
    assert.equal(faces[1].sizeUnknown, false);
    assert.equal(faces[1].widthIn, 12);
    assert.equal(faces[1].heightIn, 12);
    assert.equal(faces[1].ratio, 1);
    assert.equal(faces[1].keepOutline, true);
    assert.equal(faces[0].widthIn, 4);
  });

  it("draws a 4x4 mosaic sheet at the same size as the trapezoid sheet", () => {
    const faces = resolveSwatchFaces(
      {
        trinityName: "alabaster",
        imageUrl: "https://cdn.example/Alabaster-4x4-Large.jpeg",
        faces: [
          { imageUrl: "https://cdn.example/Alabaster-4x4-Large.jpeg", widthIn: 4, heightIn: 4, aspectRatio: 1 },
          {
            imageUrl: "https://style-access.com/Alabaster-Trapesoid-Large.jpeg",
            widthIn: 12,
            heightIn: 12,
            aspectRatio: 1,
          },
        ],
      },
      [
        { label: '4"x4"', iconKind: "square" },
        { label: '4"x4" mosaic', iconKind: "mosaic", sheetLabel: '12"x12"' },
        { label: "trapezoid mosaic", iconKind: "mosaic", sheetLabel: '12"x12"' },
      ],
    );
    assert.equal(faces[0].widthIn, 12);
    assert.equal(faces[1].widthIn, 12);
    assert.equal(faces[0].heightIn, faces[1].heightIn);
    assert.equal(faces[0].caption, "4x4 mosaic");
    assert.equal(faces[1].caption, "trapezoid");
    assert.equal(faces[1].keepOutline, true);
  });

  it("labels two field sizes once by format", () => {
    const faces = resolveSwatchFaces({
      trinityName: "cloud",
      imageUrl: "https://cdn.example/cloud-4x4.jpg",
      faces: [
        { imageUrl: "https://cdn.example/cloud-4x4.jpg", widthIn: 4, heightIn: 4, aspectRatio: 1 },
        { imageUrl: "https://cdn.example/cloud-3x6.jpg", widthIn: 3, heightIn: 6, aspectRatio: 0.5 },
      ],
    });
    assert.equal(faces[0].caption, "4x4");
    assert.equal(faces[1].caption, "3x6");
    assert.equal(faces[0].widthIn, 4);
    assert.equal(faces[1].widthIn, 3);
  });

  it("drops a loose 4x4 that only repeats the mosaic chip", () => {
    const data = omitChipFieldSizes({
      trinityName: "ithaca",
      trinityTagline: "glazed ceramic mosaic wall tile",
      description: "{{name}} mosaic.",
      heroImageUrl: "https://cdn.example/hero.jpg",
      colors: [],
      sizes: [
        { label: '4"x4"', iconKind: "square" },
        { label: '4"x4" mosaic', iconKind: "mosaic", sheetLabel: '12"x12"' },
        { label: "trapezoid mosaic", iconKind: "mosaic", sheetLabel: '12"x12"' },
      ],
      availability: { alabaster: ['4"x4"', '4"x4" mosaic (12"x12" sheet)', 'trapezoid mosaic (12"x12" sheet)'] },
      techSpecs: {},
      finishLegend: ["semi-gloss"],
      footnotes: [],
    });
    assert.deepEqual(
      data.sizes.map((size) => size.label),
      ['4"x4" mosaic', "trapezoid mosaic"],
    );
    assert.deepEqual(data.availability.alabaster, [
      '4"x4" mosaic (12"x12" sheet)',
      'trapezoid mosaic (12"x12" sheet)',
    ]);
  });

  it("uses a listed 4x4 when the color has no stored face", () => {
    const faces = resolveSwatchFaces(
      { trinityName: "zelton", imageUrl: "" },
      [{ label: '4"x4"', iconKind: "square" }],
    );
    assert.equal(faces[0].imageUrl, "");
    assert.equal(faces[0].ratio, 1);
    assert.equal(faces[0].sizeUnknown, false);
  });
});
