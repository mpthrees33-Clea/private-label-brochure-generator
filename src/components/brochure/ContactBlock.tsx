// Sync component: the QR is pre-rendered at build time and served as a
// static asset from /public/brand/. This matters because the Brochure
// tree is rendered from both server contexts (saved product pages) AND
// the client-side scrape preview where the rep can live-edit the
// Trinity name. An `async` server component inside a client tree is
// invalid (React error #482), so we keep this purely sync.
//
// Layout: "more info" caption aligns with the tech-specs h3 on the
// left. QR top aligns with the tech-specs gray header band below the
// h3. Phone/email/website are vertically centered next to the QR.
export function ContactBlock() {
  return (
    <div className="text-[9px] leading-snug text-brochure-gray">
      <p className="text-[12px] font-semibold lowercase">more info</p>
      <div className="mt-1 flex items-start gap-2.5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/trinity-qr.png"
          alt="more info"
          className="h-[72px] w-[72px]"
        />
        <div className="flex flex-col justify-center self-stretch">
          <p>866-774-3390</p>
          <p>info@trinitysurfaces.com</p>
          <p>www.trinitysurfaces.com</p>
        </div>
      </div>
    </div>
  );
}
