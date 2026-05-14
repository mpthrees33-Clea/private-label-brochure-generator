import Link from "next/link";
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
        <Link
          href="/api/brochure/pdf?source=preview"
          target="_blank"
          className="rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-white shadow-glow-accent transition hover:bg-accent-light"
        >
          Download PDF
        </Link>
      </div>
      <Brochure data={KENDALL_SAMPLE} />
    </>
  );
}
