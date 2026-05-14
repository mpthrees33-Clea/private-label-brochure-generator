import type { BrochureData } from "@/lib/brochure-types";
import { TrinityHeader } from "./TrinityHeader";
import { ColorSwatchGrid } from "./ColorSwatchGrid";
import { SizeMatrix } from "./SizeMatrix";
import { TechSpecsTable } from "./TechSpecsTable";
import { ContactBlock } from "./ContactBlock";

// Letter page in CSS px at 96dpi → 816 x 1056. We render at that exact
// size so the screen preview matches the eventual PDF output.
const PAGE_W = 816;
const PAGE_H = 1056;

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
  return (
    <section
      className="brochure-page flex flex-col bg-white shadow-md"
      style={{ width: PAGE_W, height: PAGE_H }}
    >
      <TrinityHeader
        productName={data.trinityName}
        tagline={data.trinityTagline}
      />
      <div className="mt-4 space-y-2">
        <ColorSwatchGrid colors={data.colors} />
        <SizeMatrix
          sizes={data.sizes}
          colors={data.colors}
          availability={data.availability}
        />
        {(data.finishLegend.length > 0 || data.footnotes.length > 0) && (
          <div className="flex justify-between px-[48px] text-[10px] lowercase text-[#5a5a5a]">
            <div>
              {data.footnotes.map((f) => (
                <p key={f}>{f}</p>
              ))}
            </div>
            <div className="flex items-center gap-3">
              {data.finishLegend.map((l) => (
                <span key={l} className="flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-full bg-[#1a1a1a]" />
                  {l}
                </span>
              ))}
            </div>
          </div>
        )}
        <TechSpecsTable specs={data.techSpecs} />
      </div>
      <div className="mt-auto pb-[36px]">
        <ContactBlock qrTarget="https://www.trinitysurfaces.com" />
      </div>
    </section>
  );
}
