"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

// Stacked so the "more info" caption aligns with the tech-specs h3 on
// the left, and the QR top aligns with the gray header band of the
// tech-specs table. QR stays compact — same size as before.
export function ContactBlock({ qrTarget }: { qrTarget?: string }) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  useEffect(() => {
    QRCode.toDataURL(qrTarget ?? "https://www.trinitysurfaces.com", {
      margin: 0,
      width: 144,
      color: { dark: "#585860", light: "#ffffff" },
    }).then(setQrDataUrl, () => setQrDataUrl(null));
  }, [qrTarget]);

  return (
    <div className="text-[9px] leading-snug text-brochure-gray">
      <p className="text-[12px] font-semibold lowercase">more info</p>
      <div className="mt-1 flex items-start gap-2.5">
        {qrDataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={qrDataUrl} alt="more info" className="h-[72px] w-[72px]" />
        ) : (
          <div className="h-[72px] w-[72px] bg-[#f0f0f0]" />
        )}
        <div className="flex flex-col justify-center self-stretch">
          <p>866-774-3390</p>
          <p>info@trinitysurfaces.com</p>
          <p>www.trinitysurfaces.com</p>
        </div>
      </div>
    </div>
  );
}
