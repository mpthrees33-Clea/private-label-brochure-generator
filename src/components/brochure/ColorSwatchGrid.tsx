import type { BrochureColor } from "@/lib/brochure-types";

// Tile swatches mimic a 12"x24" tile — aspect ratio MUST be 1:2.
// Never alter the ratio. If page 2 overflows, scale w AND h together
// or compress non-swatch sections. See feedback_swatch_aspect_ratio.
const SWATCH_W = 108; // → height = 216 via aspect-[1/2]
const SWATCH_GAP = 12;

export function ColorSwatchGrid({ colors }: { colors: BrochureColor[] }) {
  const hasDeco = colors.some((c) => c.decoImageUrl);
  return (
    <div className="px-[48px]">
      <SwatchRow colors={colors} key="standard" />
      {hasDeco && <SwatchRow colors={colors} deco key="deco" />}
    </div>
  );
}

function SwatchRow({
  colors,
  deco = false,
}: {
  colors: BrochureColor[];
  deco?: boolean;
}) {
  return (
    <div
      className={deco ? "mt-2 flex justify-center" : "flex justify-center"}
      style={{ gap: `${SWATCH_GAP}px` }}
    >
      {colors.map((c) => {
        const src = deco ? c.decoImageUrl ?? undefined : c.imageUrl;
        const label = deco ? `${c.trinityName} deco` : c.trinityName;
        return (
          <div key={c.trinityName + (deco ? "-deco" : "")} className="flex flex-col">
            <div
              className="aspect-[1/2] overflow-hidden bg-[#f3f3f3]"
              style={{ width: SWATCH_W }}
            >
              {src ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={src}
                  alt={label}
                  className="h-full w-full object-cover"
                />
              ) : null}
            </div>
            <span className="mt-1 text-[11px] lowercase text-[#3a3a3a]">
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
