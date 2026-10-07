import { Brochure } from "@/components/brochure/Brochure";
import { KENDALL_SAMPLE } from "@/lib/sample-data";

export const dynamic = "force-dynamic";

// Development-only preview route. Renders the hard-coded Kendall sample
// so the brochure renderer can be iterated against the reference PDF
// without needing the DB or scraper. Real production renders happen at
// /internal/brochure/[id].
export default function PreviewPage() {
  return (
    <>
      {/* Download bar — hidden when Puppeteer prints the page. */}
      <div className="sticky top-0 z-50 flex justify-end gap-3 bg-bg/80 px-6 py-3 backdrop-blur print:hidden">
        <a
          href="/api/brochure/pdf?source=preview"
          download="preview.pdf"
          className="rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-white shadow-glow-accent transition hover:bg-accent-light"
        >
          Download PDF
        </a>
      </div>
      <Brochure data={KENDALL_SAMPLE} />
    </>
  );
}
