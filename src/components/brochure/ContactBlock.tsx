"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

// Laid out so the QR's top edge lines up with the top of the tech-specs
// "technical specifications" h3 on the left side of the bottom row.
// "more info" sits next to the QR like the reference brochure.
export function ContactBlock({ qrTarget }: { qrTarget?: string }) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  useEffect(() => {
    QRCode.toDataURL(qrTarget ?? "https://www.trinitysurfaces.com", {
      margin: 0,
      width: 128,
      color: { dark: "#585860", light: "#ffffff" },
    }).then(setQrDataUrl, () => setQrDataUrl(null));
  }, [qrTarget]);

  return (
    <div className="flex items-start gap-3 text-[9px] leading-snug text-brochure-gray">
      {qrDataUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={qrDataUrl} alt="more info" className="h-[88px] w-[88px]" />
      ) : (
        <div className="h-[88px] w-[88px] bg-[#f0f0f0]" />
      )}
      <div>
        <p className="text-[12px] font-semibold lowercase text-brochure-gray">
          more info
        </p>
        <p className="mt-2">866-774-3390</p>
        <p>info@trinitysurfaces.com</p>
        <p>www.trinitysurfaces.com</p>
      </div>
    </div>
  );
}
