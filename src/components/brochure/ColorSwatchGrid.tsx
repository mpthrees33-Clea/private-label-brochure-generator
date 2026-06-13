import type { BrochureColor } from "@/lib/brochure-types";
import { proxyImageUrl } from "@/lib/image-proxy";

// Tile swatches mimic the product's real field tile. The box is sized to
// the product's TRUE aspect ratio (12"x24" → 1:2, 6"x6" → 1:1, a 2"x10"
// plank → 1:5) — never distorted. Width and height both come from the
// layout engine (computeSwatchLayout); using the pre-computed integer
// height keeps the rendered box exactly equal to the budgeted box so the
// size matrix never drifts. If horizontal space runs out, the layout
// engine adds another primary row.
const SWATCH_GAP = 12;
const ROW_GAP = 8;

export function ColorSwatchGrid({
  colors,
  swatchWidth,
  swatchHeight,
  perRow,
}: {
  colors: BrochureColor[];
  swatchWidth: number;
  swatchHeight: number;
  perRow: number;
}) {
  const hasDeco = colors.some((c) => c.decoImageUrl);
  const chunks: BrochureColor[][] = [];
  for (let i = 0; i < colors.length; i += perRow) {
    chunks.push(colors.slice(i, i + perRow));
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: `${ROW_GAP}px` }}>
      {chunks.map((row, idx) => (
        <div key={idx}>
          <SwatchRow colors={row} swatchWidth={swatchWidth} swatchHeight={swatchHeight} />
          {hasDeco && (
            <SwatchRow colors={row} swatchWidth={swatchWidth} swatchHeight={swatchHeight} deco />
          )}
        </div>
      ))}
    </div>
  );
}

function SwatchRow({
  colors,
  swatchWidth,
  swatchHeight,
  deco = false,
}: {
  colors: BrochureColor[];
  swatchWidth: number;
  swatchHeight: number;
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
          <div
            key={c.trinityName + (deco ? "-deco" : "")}
            className="flex flex-col"
          >
            <div
              className="overflow-hidden bg-[#f3f3f3]"
              style={{ width: swatchWidth, height: swatchHeight }}
            >
              {src ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={proxyImageUrl(src)}
                  alt={label}
                  className="h-full w-full object-cover"
                />
              ) : null}
            </div>
            <span className="mt-1 text-[11px] lowercase text-brochure-gray">
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
