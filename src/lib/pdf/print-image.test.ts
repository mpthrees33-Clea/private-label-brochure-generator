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