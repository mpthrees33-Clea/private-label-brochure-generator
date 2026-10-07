import assert from "node:assert/strict";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, it } from "node:test";
import sharp from "sharp";
import { findBlankInlinedImages, inlineBrochureImages } from "./inline-images";

const BLANK_GIF = "R0lGODlhAQAB";

describe("inlineBrochureImages", () => {
  it("embeds public brand images and drops urls that would hit the app", async () => {
    const html = `<img src="/brand/trinity-tile-logo.png" data-print-w="104" data-print-h="40" data-print-fit="inside"><img src="/api/proxy-image?url=http%3A%2F%2F127.0.0.1%3A3000%2Fsecret.png" data-print-w="40" data-print-h="80" data-print-fit="cover">`;
    const out = await inlineBrochureImages(html);
    assert.match(out, /src="data:image\/png;base64,/);
    assert.equal(out.includes("127.0.0.1"), false);
    assert.equal(out.includes("/api/proxy-image"), false);
    assert.equal(out.includes("/brand/"), false);
    assert.equal(out.includes(BLANK_GIF), false);
    const logo = /src="(data:image\/png;base64,[^"]+)"/.exec(out);
    assert.ok(logo);
    const meta = await sharp(Buffer.from(logo[1].split(",")[1], "base64")).metadata();
    assert.ok((meta.width ?? 0) > 1);
    assert.ok((meta.height ?? 0) > 1);
    assert.deepEqual(await findBlankInlinedImages(out), ["empty image"]);
  });

  it("inlines a webp photo as a raster larger than 1x1", async () => {
    const webp = await sharp({
      create: {
        width: 900,
        height: 1600,
        channels: 3,
        background: { r: 40, g: 90, b: 140 },
      },
    })
      .webp()
      .toBuffer();
    const publicDir = path.join(process.cwd(), "public", "__pdf-webp-test");
    await mkdir(publicDir, { recursive: true });
    await writeFile(path.join(publicDir, "swatch.webp"), webp);
    try {
      const html = `<img src="/__pdf-webp-test/swatch.webp" data-print-w="80" data-print-h="160" data-print-fit="cover">`;
      const out = await inlineBrochureImages(html);
      assert.equal(out.includes(BLANK_GIF), false);
      assert.equal(out.includes(".webp"), false);
      const src = /src="(data:image\/(?:jpeg|png);base64,[^"]+)"/.exec(out);
      assert.ok(src, out.slice(0, 120));
      const meta = await sharp(Buffer.from(src[1].split(",")[1], "base64")).metadata();
      assert.ok((meta.width ?? 0) > 1, `width ${meta.width}`);
      assert.ok((meta.height ?? 0) > 1, `height ${meta.height}`);
      assert.deepEqual(await findBlankInlinedImages(out), []);
    } finally {
      await rm(publicDir, { recursive: true, force: true });
    }
  });

  it("flags a 1x1 data image instead of treating it as a photo", async () => {
    const html = `<img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" data-print-w="40" data-print-h="80" data-print-fit="cover">`;
    const blanks = await findBlankInlinedImages(html);
    assert.ok(blanks.length > 0);
  });
});