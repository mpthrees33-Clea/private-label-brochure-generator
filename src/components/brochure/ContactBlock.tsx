"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

export function ContactBlock({ qrTarget }: { qrTarget?: string }) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  useEffect(() => {
    QRCode.toDataURL(qrTarget ?? "https://www.trinitysurfaces.com", {
      margin: 0,
      width: 88,
      color: { dark: "#585860", light: "#ffffff" },
    }).then(setQrDataUrl, () => setQrDataUrl(null));
  }, [qrTarget]);

  return (
    <div className="flex items-end gap-3 text-[9px] text-brochure-gray">
      {qrDataUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={qrDataUrl} alt="more info" className="h-[72px] w-[72px]" />
      ) : (
        <div className="h-[72px] w-[72px] bg-[#f0f0f0]" />
      )}
      <div className="leading-snug">
        <p className="mb-0.5 text-[11px] font-semibold lowercase">more info</p>
        <p>866-774-3390</p>
        <p>info@trinitysurfaces.com</p>
        <p>www.trinitysurfaces.com</p>
      </div>
    </div>
  );
}
