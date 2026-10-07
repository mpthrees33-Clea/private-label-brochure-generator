/** Download name shared by the PDF route and the Download PDF button. */
export function brochurePdfFilename(name: string, fallback = "brochure"): string {
  const base = (name || fallback).replace(/[\r\n"\\/]/g, "").trim() || fallback;
  return base.toLowerCase().endsWith(".pdf") ? base : `${base}.pdf`;
}
