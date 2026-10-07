import assert from "node:assert/strict";
import { describe, it } from "node:test";
import sharp from "sharp";
import { compressForPrint, JPEG_QUALITY } from "./print-image";

describe("compressForPrint", () => {
  it("downscales a cover photo to 2x the rendered box as JPEG", async () => {
    const source = await sharp({
      create: {
        width: 2400,
        height: 3600,
        channels: 3,
        background: { r: 40, g: 90, b: 140 },
      },
    })
      .jpeg()
      .toBuffer();
    const out = await compressForPrint(source, { width: 129, height: 258, fit: "cover" });
    const meta = await sharp(out.bytes).metadata();
    assert.equal(out.contentType, "image/jpeg");
    assert.equal(meta.width, 129 * 2);
    assert.equal(meta.height, 258 * 2);
    assert.ok(out.bytes.length < source.length / 5, `got ${out.bytes.length} from ${source.length}`);
    assert.equal(JPEG_QUALITY, 85);
  });

  it("transcodes a webp photo to a jpeg larger than 1x1", async () => {
    const source = await sharp({
      create: {
        width: 900,
        height: 1600,
        channels: 3,
        background: { r: 180, g: 170, b: 160 },
      },
    })
      .webp()
      .toBuffer();
    const out = await compressForPrint(source, { width: 80, height: 160, fit: "cover" });
    const meta = await sharp(out.bytes).metadata();
    assert.equal(out.contentType, "image/jpeg");
    assert.ok((meta.width ?? 0) > 1);
    assert.ok((meta.height ?? 0) > 1);
    assert.equal(meta.width, 160);
    assert.equal(meta.height, 320);
  });

  it("trims white padding before a plank is fitted", async () => {
    const source = await sharp({
      create: {
        width: 400,
        height: 400,
        channels: 3,
        background: { r: 255, g: 255, b: 255 },
      },
    })
      .composite([
        {
          input: await sharp({
            create: {
              width: 320,
              height: 60,
              channels: 3,
              background: { r: 214, g: 196, b: 166 },
            },
          })
            .jpeg()
            .toBuffer(),
          left: 40,
          top: 170,
        },
      ])
      .jpeg()
      .toBuffer();
    const out = await compressForPrint(source, { width: 160, height: 30, fit: "cover", trim: true });
    const meta = await sharp(out.bytes).metadata();
    assert.equal(meta.width, 320);
    assert.equal(meta.height, 60);
    const pixel = await sharp(out.bytes).raw().toBuffer();
    const mid = Math.floor(pixel.length / 2);
    assert.ok(pixel[mid] < 250, `trimmed plank stayed white (${pixel[mid]})`);
  });

  it("keeps a transparent logo as PNG and does not enlarge it", async () => {
    const source = await sharp({
      create: {
        width: 80,
        height: 40,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .png()
      .toBuffer();
    const out = await compressForPrint(source, { width: 104, height: 40, fit: "inside" });
    const meta = await sharp(out.bytes).metadata();
    assert.equal(out.contentType, "image/png");
    assert.ok((meta.width ?? 0) <= 80);
    assert.ok((meta.height ?? 0) <= 40);
  });
});