import type { Metadata, Viewport } from "next";
import { DM_Sans } from "next/font/google";
import "./globals.css";
import { StorageBanner } from "@/components/StorageBanner";
import { GoogleAnalytics } from "@/components/GoogleAnalytics";

// DM Sans is the closest free analogue to Trinity's licensed Objektiv —
// same humanist-geometric character, generous proportions, and a clean
// rendering at body sizes.
const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const brand = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-brand",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Quick Flip Brochures · Trinity Surfaces",
  description: "Trinity Surfaces private-label brochure generator",
};

// Without this, mobile Safari renders at its default 980px virtual
// viewport and the rep sees the whole desktop layout pinched-to-fit —
// which is why the brochure looked "zoomed in" and unreadable on phones.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${dmSans.variable} ${brand.variable}`}>
      <GoogleAnalytics />
      <body className="font-sans antialiased bg-bg text-fg">
        <StorageBanner />
        {children}
      </body>
    </html>
  );
}
