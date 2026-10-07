/** @type {import('next').NextConfig} */
const nextConfig = {
  // Self-host build target: emits .next/standalone/server.js so PM2 can
  // launch a single-file server without copying node_modules into /var/www.
  output: "standalone",
  experimental: {
    serverComponentsExternalPackages: [
      "puppeteer-core",
      "@sparticuz/chromium",
      "@sparticuz/chromium-min",
      "playwright",
      "exceljs",
    ],
    // Brand and sample images are read from disk while inlining the PDF
    // HTML. Vercel does not put `public/` on the function filesystem
    // unless it is traced.
    outputFileTracingIncludes: {
      "/api/brochure/pdf": ["./public/brand/**/*", "./public/sample/**/*"],
    },
  },
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
};

export default nextConfig;
