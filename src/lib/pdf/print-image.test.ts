import assert from "node:assert/strict";
import { describe, it } from "node:test";
import sharp from "sharp";
import { trimNearWhite } from "../image-trim";
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

  it("clears white bays around an irregular sheet without eating the tile", async () => {
    const width = 80;
    const height = 80;
    const raw = Buffer.alloc(width * height * 3, 255);
    const put = (x: number, y: number, r: number, g: number, b: number) => {
      const offset = (y * width + x) * 3;
      raw[offset] = r;
      raw[offset + 1] = g;
      raw[offset + 2] = b;
    };
    for (let y = 16; y < 36; y++) {
      for (let x = 16; x < 64; x++) put(x, y, 90, 80, 70);
    }
    for (let y = 36; y < 64; y++) {
      for (let x = 36; x < 64; x++) put(x, y, 90, 80, 70);
    }
    const source = await sharp(raw, { raw: { width, height, channels: 3 } }).jpeg().toBuffer();
    const trimmed = await trimNearWhite(source);
    const meta = await sharp(trimmed.bytes).metadata();
    assert.equal(meta.format, "png");
    assert.equal(meta.hasAlpha, true);
    const pixels = await sharp(trimmed.bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let transparent = 0;
    let tile = 0;
    for (let i = 0; i < pixels.data.length; i += 4) {
      if (pixels.data[i + 3] === 0) transparent += 1;
      else if (pixels.data[i] < 140) tile += 1;
    }
    assert.ok(transparent > 20, `transparent pixels ${transparent}`);
    assert.ok(tile > 100, `tile pixels ${tile}`);
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