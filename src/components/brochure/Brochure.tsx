import type { BrochureData } from "@/lib/brochure-types";
import { PAGE_W, PAGE_H, getSwatchSize } from "@/lib/brochure-layout";
import { TrinityHeader } from "./TrinityHeader";
import { ColorSwatchGrid } from "./ColorSwatchGrid";
import { SizeMatrix } from "./SizeMatrix";
import { TechSpecsTable } from "./TechSpecsTable";
import { ContactBlock } from "./ContactBlock";

export function Brochure({ data }: { data: BrochureData }) {
  return (
    <div className="brochure-root flex flex-col items-center gap-6 bg-[#e6e8eb] py-6">
      <Page1 data={data} />
      <Page2 data={data} />
    </div>
  );
}

function Page1({ data }: { data: BrochureData }) {
  return (
    <section
      className="brochure-page flex flex-col bg-white shadow-md"
      style={{ width: PAGE_W, height: PAGE_H }}
    >
      <TrinityHeader
        productName={data.trinityName}
        tagline={data.trinityTagline}
      />
      <div className="mt-6 px-[48px]">
        {/* Hero is roughly 0.95 aspect ratio in the reference */}
        <div className="aspect-[19/20] w-full overflow-hidden bg-[#f3f3f3]">
          {data.heroImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={data.heroImageUrl}
              alt={data.trinityName}
              className="h-full w-full object-cover"
            />
          ) : null}
        </div>
      </div>
      <div className="mt-6 px-[48px]">
        <p className="text-[14px] leading-snug text-[#1a1a1a]">
          {data.description}
        </p>
      </div>
    </section>
  );
}

function Page2({ data }: { data: BrochureData }) {
  const swatch = getSwatchSize(data);
  return (
    <section
      className="brochure-page flex flex-col bg-white shadow-md"
      style={{ width: PAGE_W, height: PAGE_H }}
    >
      <TrinityHeader
        productName={data.trinityName}
        tagline={data.trinityTagline}
      />
      <div className="mt-3 space-y-1.5">
        <ColorSwatchGrid colors={data.colors} swatchWidth={swatch.width} />
        <SizeMatrix
          sizes={data.sizes}
          colors={data.colors}
          availability={data.availability}
        />
        {(data.finishLegend.length > 0 || data.footnotes.length > 0) && (
          <div className="flex justify-between px-[48px] text-[10px] lowercase text-brochure-gray">
            <div>
              {data.footnotes.map((f) => (
                <p key={f}>{f}</p>
              ))}
            </div>
            <div className="flex items-center gap-3">
              {data.finishLegend.map((l) => (
                <span key={l} className="flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-full bg-brochure-gray" />
                  {l}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
      {/* Bottom row: tech specs (left) + QR/contact (right) on the same line.
          items-start so the QR top lines up with the tech-specs h3 top. */}
      <div className="mt-auto flex items-start justify-between gap-6 px-[48px] pb-[36px]">
        <div className="flex-1 min-w-0">
          <TechSpecsTable specs={data.techSpecs} />
        </div>
        <ContactBlock qrTarget="https://www.trinitysurfaces.com" />
      </div>
    </section>
  );
}
