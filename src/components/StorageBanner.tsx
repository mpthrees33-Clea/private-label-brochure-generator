import { getStorageStatus } from "@/lib/store/blob-storage";

// Server component. Renders a red banner sitewide when running on
// Vercel without BLOB_READ_WRITE_TOKEN. Saving products in that mode
// silently breaks across serverless instances — the cause of the
// "click save → 404" reports — so we make the state loud and
// unmistakable until the rep attaches a Blob store.
export function StorageBanner() {
  const status = getStorageStatus();
  if (!status.productionMissingToken) return null;
  return (
    <div className="sticky top-0 z-50 bg-red-600 px-6 py-2 text-center text-xs font-medium text-white shadow-md print:hidden">
      <strong className="font-bold">Storage not configured.</strong>{" "}
      Saves cannot persist across requests until you attach a Vercel Blob
      store. Vercel → this project → Storage → Create → Blob → redeploy.
      <span className="ml-2 opacity-80">
        Diagnostic: <a className="underline" href="/api/debug/storage" target="_blank" rel="noreferrer">/api/debug/storage</a>
      </span>
    </div>
  );
}
