/** @type {import('next').NextConfig} */
const nextConfig = {
  // Self-host build target: emits .next/standalone/server.js so PM2 can
  // launch a single-file server without copying node_modules into /var/www.
  output: "standalone",
  experimental: {
    serverComponentsExternalPackages: [
      "puppeteer-core",
      "@sparticuz/chromium",
      "playwright",
      "exceljs",
    ],
  },
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
};

export default nextConfig;
