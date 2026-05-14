import type { Metadata } from "next";
import { Montserrat } from "next/font/google";
import "./globals.css";

const montserrat = Montserrat({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const brand = Montserrat({
  subsets: ["latin"],
  weight: ["700", "800", "900"],
  variable: "--font-brand",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Quick Flip Brochures",
  description: "Trinity Surfaces private-label brochure generator",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${montserrat.variable} ${brand.variable}`}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
