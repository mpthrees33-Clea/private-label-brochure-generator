import type {
  BlockId,
  BrochureData,
  BlockPosition,
} from "@/lib/brochure-types";
import {
  BLOCK_DEFAULTS,
  CONTENT_W,
  PAGE_W,
  PAGE_H,
  getSwatchLayout,
  sizeMatrixTop,
  type SwatchLayout,
} from "@/lib/brochure-layout";
import { renderDescription } from "@/lib/brochure-description";
import { proxyImageUrl } from "@/lib/image-proxy";
import { TrinityHeader } from "./TrinityHeader";
import { ColorSwatchGrid } from "./ColorSwatchGrid";
import { SizeMatrix } from "./SizeMatrix";
import { TechSpecsTable } from "./TechSpecsTable";
import { ContactBlock } from "./ContactBlock";
import { FinishMarker } from "./FinishMarker";
import { reconcileFinishLegend } from "@/lib/finish-legend";
import { omitChipFieldSizes } from "@/lib/swatch-geometry";

export function resolveBlockPosition(
  id: BlockId,
  data: BrochureData,
  swatch: SwatchLayout,
): BlockPosition & { width: number; page: 1 | 2 } {
  const defaults = BLOCK_DEFAULTS[id];
  const dynamicY = id === "sizeMatrix" ? sizeMatrixTop(swatch) : defaults.y;
  const override = data.layoutOverrides?.[id];
  return {
    page: defaults.page,
    width: defaults.width,
    x: override?.x ?? defaults.x,
    y: override?.y ?? dynamicY,
  };
}

export function Brochure({
  data,
  factoryName,
}: {
  data: BrochureData;
  /** Optional: enables the safety-net replacement of any literal factory
   * name occurrence in the description. */
  factoryName?: string;
}) {
  data = omitChipFieldSizes({ ...data, finishLegend: reconcileFinishLegend(data) });
  const swatch = getSwatchLayout(data);
  return (
    <div className="brochure-root flex flex-col items-center gap-6 bg-[#e6e8eb] py-6">
      <Page1 data={data} factoryName={factoryName} />
      <Page2 data={data} swatch={swatch} />
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
  const heroPos = resolveBlockPosition("hero", data, getSwatchLayout(data));
  const descPos = resolveBlockPosition("description", data, getSwatchLayout(data));
  return (
    <section
      className="brochure-page relative overflow-hidden bg-white shadow-md"
      style={{ width: PAGE_W, height: PAGE_H }}
    >
      <TrinityHeader
        productName={data.trinityName}
        tagline={data.trinityTagline}
      />
      <Block id="hero" pos={heroPos}>
        <div className="aspect-[19/20] w-full overflow-hidden bg-[#f3f3f3]">
          {data.heroImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={proxyImageUrl(data.heroImageUrl)}
              alt={data.trinityName}
              className="h-full w-full object-cover"
              data-print-w={CONTENT_W}
              data-print-h={Math.round((CONTENT_W * 20) / 19)}
              data-print-fit="cover"
            />
          ) : null}
        </div>
      </Block>
      <Block id="description" pos={descPos}>
        <p className="text-[14px] leading-snug text-[#1a1a1a]">
          {renderedDescription}
        </p>
      </Block>
    </section>
  );
}

function Page2({ data, swatch }: { data: BrochureData; swatch: SwatchLayout }) {
  const swatchesPos = resolveBlockPosition("swatches", data, swatch);
  const sizeMatrixPos = resolveBlockPosition("sizeMatrix", data, swatch);
  const techSpecsPos = resolveBlockPosition("techSpecs", data, swatch);
  const contactPos = resolveBlockPosition("contact", data, swatch);
  return (
    <section
      className="brochure-page relative overflow-hidden bg-white shadow-md"
      style={{ width: PAGE_W, height: PAGE_H }}
    >
      <TrinityHeader
        productName={data.trinityName}
        tagline={data.trinityTagline}
      />
      <Block id="swatches" pos={swatchesPos}>
        <ColorSwatchGrid colors={data.colors} sizes={data.sizes} layout={swatch} />
      </Block>
      <Block id="sizeMatrix" pos={sizeMatrixPos}>
        <SizeMatrix
          sizes={data.sizes}
          colors={data.colors}
          availability={data.availability}
          availabilityFinishes={data.availabilityFinishes}
          finishLegend={data.finishLegend}
        />
        {data.specialPieces && data.specialPieces.length > 0 && (
          <p className="mt-1 text-[10px] lowercase leading-tight text-brochure-gray">
            trims & special pieces: {data.specialPieces.join(", ")}
          </p>
        )}
        {(data.finishLegend.length > 0 || data.footnotes.length > 0) && (
          <div className="mt-1.5 text-[10px] lowercase leading-tight text-brochure-gray">
            {data.footnotes.map((f) => (
              <p key={f} className="max-w-full break-words">
                {f}
              </p>
            ))}
            {data.finishLegend.length > 0 && (
              <div className="mt-0.5 flex items-center justify-end gap-3">
                {data.finishLegend.map((l) => (
                  <span key={l} className="flex items-center gap-1">
                    <FinishMarker finish={l} variant="legend" />
                    {l}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </Block>
      <Block id="techSpecs" pos={techSpecsPos}>
        <TechSpecsTable
          specs={data.techSpecs}
          standards={data.specStandards}
          sources={data.specSources}
        />
      </Block>
      <Block id="contact" pos={contactPos}>
        <ContactBlock />
      </Block>
    </section>
  );
}

/** Absolute-positioned block shell shared by view and edit modes. The
 * editor finds these via [data-block-id] to attach drag handlers without
 * forking the renderer. */
function Block({
  id,
  pos,
  children,
}: {
  id: BlockId;
  pos: { x: number; y: number; width: number };
  children: React.ReactNode;
}) {
  return (
    <div
      data-block-id={id}
      style={{
        position: "absolute",
        left: pos.x,
        top: pos.y,
        width: pos.width,
      }}
    >
      {children}
    </div>
  );
}
