import type { BrochureData } from "@/lib/brochure-types";
import {
  PAGE_W,
  PAGE_H,
  HEADER_H,
  BOTTOM_BLOCK_H,
  getSwatchLayout,
} from "@/lib/brochure-layout";
import { renderDescription } from "@/lib/brochure-description";
import { TrinityHeader } from "./TrinityHeader";
import { ColorSwatchGrid } from "./ColorSwatchGrid";
import { SizeMatrix } from "./SizeMatrix";
import { TechSpecsTable } from "./TechSpecsTable";
import { ContactBlock } from "./ContactBlock";

export function Brochure({
  data,
  factoryName,
}: {
  data: BrochureData;
  /** Optional: enables the safety-net replacement of any literal factory
   * name occurrence in the description. */
  factoryName?: string;
}) {
  return (
    <div className="brochure-root flex flex-col items-center gap-6 bg-[#e6e8eb] py-6">
      <Page1 data={data} factoryName={factoryName} />
      <Page2 data={data} />
    </div>
  );
}

function Page1({
  data,
  factoryName,
}: {
  data: BrochureData;
  factoryName?: string;
}) {
  const renderedDescription = renderDescription(
    data.description,
    data.trinityName,
    factoryName,
  );
  return (
    <section
      className="brochure-page flex flex-col overflow-hidden bg-white shadow-md"
      style={{ width: PAGE_W, height: PAGE_H }}
    >
      <TrinityHeader
        productName={data.trinityName}
        tagline={data.trinityTagline}
      />
      <div className="mt-4 px-[48px]">
        {/* Hero ~0.95 aspect ratio in the reference */}
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
      <div className="mt-4 px-[48px]">
        <p className="text-[14px] leading-snug text-[#1a1a1a]">
          {renderedDescription}
        </p>
      </div>
    </section>
  );
}

function Page2({ data }: { data: BrochureData }) {
  const swatch = getSwatchLayout(data);
  // Middle content (swatches + size matrix) is pinned BETWEEN the header
  // and the tech-specs block. Its height is bounded, and overflow:hidden
  // clips anything that doesn't fit. The bottom row is absolutely
  // positioned so the tech specs CANNOT be pushed off the page no matter
  // what the middle content does — bulletproof.
  const middleHeight = PAGE_H - HEADER_H - BOTTOM_BLOCK_H;
  return (
    <section
      className="brochure-page relative overflow-hidden bg-white shadow-md"
      style={{ width: PAGE_W, height: PAGE_H }}
    >
      <TrinityHeader
        productName={data.trinityName}
        tagline={data.trinityTagline}
      />
      <div
        className="overflow-hidden"
        style={{ height: middleHeight }}
      >
        <div className="mt-3 space-y-1.5">
          <ColorSwatchGrid
            colors={data.colors}
            swatchWidth={swatch.width}
            perRow={swatch.perRow}
          />
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
      </div>
      {/* Bottom block: pinned to the page bottom, fixed reserved height,
          overflow-hidden so nothing inside can extend past it either. */}
      <div
        className="absolute left-0 right-0 bottom-0 overflow-hidden flex items-start justify-between gap-6 px-[48px] pb-[28px]"
        style={{ height: BOTTOM_BLOCK_H }}
      >
        <div className="flex-1 min-w-0 overflow-hidden">
          <TechSpecsTable specs={data.techSpecs} />
        </div>
        <ContactBlock />
      </div>
    </section>
  );
}
