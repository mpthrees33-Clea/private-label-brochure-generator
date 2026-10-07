/** @type {import('next').NextConfig} */
const nextConfig = {
  // Self-host build target: emits .next/standalone/server.js so PM2 can
  // launch a single-file server without copying node_modules into /var/www.
  // Production builds pass `next build --webpack`. Turbopack's file tracer
  // follows the dynamic upload and Chrome paths and pulls the whole repo,
  // including .git, into the PDF function. Webpack keeps that trace scoped.
  output: "standalone",
  // Native and heavy packages stay external so the standalone server
  // requires them at runtime instead of bundling them.
  serverExternalPackages: [
    "puppeteer-core",
    "@sparticuz/chromium",
    "@sparticuz/chromium-min",
    "playwright",
    "exceljs",
    "sharp",
    "unpdf",
  ],
  // Brand and sample images are read from disk while inlining the PDF
  // HTML. Vercel does not put `public/` on the function filesystem
  // unless it is traced.
  outputFileTracingIncludes: {
    "/api/brochure/pdf": ["./public/brand/**/*", "./public/sample/**/*"],
  },
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
};

export default nextConfig;
