import type { Metadata, Viewport } from "next";
import { Montserrat } from "next/font/google";
import "./globals.css";
import { StorageBanner } from "@/components/StorageBanner";

const montserrat = Montserrat({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const brand = Montserrat({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-brand",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Quick Flip Brochures",
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
    <html lang="en" className={`${montserrat.variable} ${brand.variable}`}>
      <body className="font-sans antialiased">
        <StorageBanner />
        {children}
      </body>
    </html>
  );
}
