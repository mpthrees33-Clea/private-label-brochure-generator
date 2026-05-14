"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

export function ContactBlock({ qrTarget }: { qrTarget?: string }) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  useEffect(() => {
    QRCode.toDataURL(qrTarget ?? "https://www.trinitysurfaces.com", {
      margin: 0,
      width: 96,
    }).then(setQrDataUrl, () => setQrDataUrl(null));
  }, [qrTarget]);

  return (
    <div className="flex items-end justify-end gap-3 px-[48px] text-[10px] text-[#3a3a3a]">
      {qrDataUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={qrDataUrl}
          alt="more info"
          className="h-[72px] w-[72px]"
        />
      ) : (
        <div className="h-[72px] w-[72px] bg-[#f0f0f0]" />
      )}
      <div>
        <p className="text-[12px] font-semibold lowercase text-[#1a1a1a]">
          more info
        </p>
        <p>866-774-3390</p>
        <p>info@trinitysurfaces.com</p>
        <p>www.trinitysurfaces.com</p>
      </div>
    </div>
  );
}
