import type { BrochureColor } from "@/lib/brochure-types";

// Tile swatches mimic a 12"x24" tile — aspect ratio MUST be 1:2.
// Never alter the ratio. If horizontal space runs out, the layout
// engine adds another primary row (see brochure-layout.computeSwatchLayout).
const SWATCH_GAP = 12;
const ROW_GAP = 8;

export function ColorSwatchGrid({
  colors,
  swatchWidth,
  perRow,
}: {
  colors: BrochureColor[];
  swatchWidth: number;
  perRow: number;
}) {
  const hasDeco = colors.some((c) => c.decoImageUrl);
  const chunks: BrochureColor[][] = [];
  for (let i = 0; i < colors.length; i += perRow) {
    chunks.push(colors.slice(i, i + perRow));
  }
  return (
    <div className="px-[48px]" style={{ display: "flex", flexDirection: "column", gap: `${ROW_GAP}px` }}>
      {chunks.map((row, idx) => (
        <div key={idx}>
          <SwatchRow colors={row} swatchWidth={swatchWidth} />
          {hasDeco && (
            <SwatchRow colors={row} swatchWidth={swatchWidth} deco />
          )}
        </div>
      ))}
    </div>
  );
}

function SwatchRow({
  colors,
  swatchWidth,
  deco = false,
}: {
  colors: BrochureColor[];
  swatchWidth: number;
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
              className="aspect-[1/2] overflow-hidden bg-[#f3f3f3]"
              style={{ width: swatchWidth }}
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
            <span className="mt-1 text-[11px] lowercase text-brochure-gray">
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
