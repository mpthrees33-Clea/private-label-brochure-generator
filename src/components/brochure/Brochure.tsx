import type {
  BlockId,
  BrochureData,
  BlockPosition,
} from "@/lib/brochure-types";
import {
  BLOCK_DEFAULTS,
  PAGE_W,
  PAGE_H,
  HEADER_H,
  getSwatchLayout,
  type SwatchLayout,
} from "@/lib/brochure-layout";
import { renderDescription } from "@/lib/brochure-description";
import { proxyImageUrl } from "@/lib/image-proxy";
import { TrinityHeader } from "./TrinityHeader";
import { ColorSwatchGrid } from "./ColorSwatchGrid";
import { SizeMatrix } from "./SizeMatrix";
import { TechSpecsTable } from "./TechSpecsTable";
import { ContactBlock } from "./ContactBlock";

// Vertical geometry for the page-2 mid-section. Swatches stack into rows
// then size matrix flows immediately below them. Used to compute a sane
// DEFAULT y for the sizeMatrix block — once the rep drags it, the
// override coord wins.
const PAGE2_TOP = HEADER_H + 12;
const SECTION_GAP = 8;
const SWATCH_LABEL_H = 18;
const SWATCH_ROW_GAP_BETWEEN_ROWS = 8;

function defaultSizeMatrixY(data: BrochureData, swatch: SwatchLayout): number {
  const hasDeco = data.colors.some((c) => c.decoImageUrl);
  const visualRowsPerPrimary = hasDeco ? 2 : 1;
  const visualRows = swatch.primaryRows * visualRowsPerPrimary;
  const swatchH =
    visualRows * (swatch.height + SWATCH_LABEL_H) +
    Math.max(0, visualRows - 1) * SWATCH_ROW_GAP_BETWEEN_ROWS;
  return PAGE2_TOP + swatchH + SECTION_GAP;
}

export function resolveBlockPosition(
  id: BlockId,
  data: BrochureData,
  swatch: SwatchLayout,
): BlockPosition & { width: number; page: 1 | 2 } {
  const defaults = BLOCK_DEFAULTS[id];
  const dynamicY = id === "sizeMatrix" ? defaultSizeMatrixY(data, swatch) : defaults.y;
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
      {/* Hero stays in-flow — not draggable per spec. */}
      <div className="mt-4 px-[48px]">
        <div className="aspect-[19/20] w-full overflow-hidden bg-[#f3f3f3]">
          {data.heroImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={proxyImageUrl(data.heroImageUrl)}
              alt={data.trinityName}
              className="h-full w-full object-cover"
            />
          ) : null}
        </div>
      </div>
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
        <ColorSwatchGrid
          colors={data.colors}
          swatchWidth={swatch.width}
          perRow={swatch.perRow}
        />
      </Block>
      <Block id="sizeMatrix" pos={sizeMatrixPos}>
        <SizeMatrix
          sizes={data.sizes}
          colors={data.colors}
          availability={data.availability}
        />
        {(data.finishLegend.length > 0 || data.footnotes.length > 0) && (
          <div className="mt-1.5 flex justify-between text-[10px] lowercase text-brochure-gray">
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
      </Block>
      <Block id="techSpecs" pos={techSpecsPos}>
        <TechSpecsTable specs={data.techSpecs} />
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
