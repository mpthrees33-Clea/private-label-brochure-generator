import QRCode from "qrcode";

// Server component so the QR is baked into the SSR HTML. Puppeteer
// captures the page right after networkidle, so a client-side useEffect
// QR would race the screenshot. Generating server-side avoids the race.
//
// Layout: "more info" caption aligns with the tech-specs h3 on the
// left. QR top aligns with the tech-specs gray header band below the
// h3. Phone/email/website are vertically centered next to the QR.
export async function ContactBlock({ qrTarget }: { qrTarget?: string }) {
  const qrDataUrl = await QRCode.toDataURL(
    qrTarget ?? "https://www.trinitysurfaces.com",
    {
      margin: 0,
      width: 144,
      color: { dark: "#585860", light: "#ffffff" },
    },
  );

  return (
    <div className="text-[9px] leading-snug text-brochure-gray">
      <p className="text-[12px] font-semibold lowercase">more info</p>
      <div className="mt-1 flex items-start gap-2.5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qrDataUrl} alt="more info" className="h-[72px] w-[72px]" />
        <div className="flex flex-col justify-center self-stretch">
          <p>866-774-3390</p>
          <p>info@trinitysurfaces.com</p>
          <p>www.trinitysurfaces.com</p>
        </div>
      </div>
    </div>
  );
}
