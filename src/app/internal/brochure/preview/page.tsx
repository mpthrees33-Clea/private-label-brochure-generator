import { Brochure } from "@/components/brochure/Brochure";
import { KENDALL_SAMPLE } from "@/lib/sample-data";

export const dynamic = "force-dynamic";

// Development-only preview route. Renders the hard-coded Kendall sample
// so the brochure renderer can be iterated against the reference PDF
// without needing the DB or scraper. Real production renders happen at
// /internal/brochure/[id].
export default function PreviewPage() {
  return <Brochure data={KENDALL_SAMPLE} />;
}
