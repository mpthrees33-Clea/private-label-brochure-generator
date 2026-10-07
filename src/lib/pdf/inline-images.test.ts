import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { inlineBrochureImages } from "./inline-images";

describe("inlineBrochureImages", () => {
  it("embeds public brand images and drops urls that would hit the app", async () => {
    const html = `<img src="/brand/trinity-tile-logo.png"><img src="/api/proxy-image?url=http%3A%2F%2F127.0.0.1%3A3000%2Fsecret.png">`;
    const out = await inlineBrochureImages(html);
    assert.match(out, /src="data:image\/png;base64,/);
    assert.equal(out.includes("127.0.0.1"), false);
    assert.equal(out.includes("/api/proxy-image"), false);
    assert.equal(out.includes("/brand/"), false);
  });
});