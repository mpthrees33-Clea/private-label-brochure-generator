import { createElement } from "react";
import { Brochure } from "@/components/brochure/Brochure";
import type { BrochureData } from "@/lib/brochure-types";
import { BROCHURE_PRINT_CSS } from "./brochure-print-css";
import { inlineBrochureImages } from "./inline-images";
import { renderMarkup } from "./render-markup";

// Full HTML document for headless Chromium. Images are data URIs and
// CSS/fonts are inlined, so page.setContent() does not fetch the app.
// That avoids nginx basic auth on the VPS and Vercel Deployment
// Protection, and it does not need a process listening on 127.0.0.1
// (there isn't one inside a Vercel serverless function).
export async function buildBrochureDocument(
  data: BrochureData,
  factoryName?: string,
): Promise<string> {
  const body = await renderMarkup(createElement(Brochure, { data, factoryName }));
  const inlined = await inlineBrochureImages(body);
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><style>${BROCHURE_PRINT_CSS}</style></head><body>${inlined}</body></html>`;
}
