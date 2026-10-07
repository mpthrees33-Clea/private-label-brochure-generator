import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isLoopbackOrigin, resolveBrochureRenderOrigin } from "./origin";

describe("resolveBrochureRenderOrigin", () => {
  it("uses loopback and PORT when the public host is behind a proxy", () => {
    const origin = resolveBrochureRenderOrigin({
      hostHeader: "brochures.clea-solutions.ai",
      forwardedProto: "https",
      portEnv: "3002",
      overrideEnv: "",
    });
    assert.equal(origin, "http://127.0.0.1:3002");
  });

  it("does not follow a public Host when PORT is unset", () => {
    const origin = resolveBrochureRenderOrigin({
      hostHeader: "brochures.clea-solutions.ai",
      forwardedProto: "https",
      portEnv: "",
      overrideEnv: "",
    });
    assert.equal(origin, "http://127.0.0.1:3000");
  });

  it("trusts the port on a loopback Host during next dev", () => {
    const origin = resolveBrochureRenderOrigin({
      hostHeader: "localhost:3000",
      forwardedProto: null,
      portEnv: "",
      overrideEnv: "",
    });
    assert.equal(origin, "http://127.0.0.1:3000");
  });

  it("honors PDF_RENDER_ORIGIN when set", () => {
    const origin = resolveBrochureRenderOrigin({
      hostHeader: "brochures.clea-solutions.ai",
      forwardedProto: "https",
      portEnv: "3002",
      overrideEnv: "http://127.0.0.1:3010/",
    });
    assert.equal(origin, "http://127.0.0.1:3010");
  });

  it("treats 127.0.0.1 as loopback so basic auth is not attached", () => {
    assert.equal(isLoopbackOrigin("http://127.0.0.1:3002/internal/brochure/preview"), true);
    assert.equal(isLoopbackOrigin("https://brochures.clea-solutions.ai/internal/brochure/preview"), false);
  });
});
