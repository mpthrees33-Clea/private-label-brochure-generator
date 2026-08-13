import type { SwatchCell } from "@/lib/brochure-layout";
import { proxyImageUrl } from "@/lib/image-proxy";

// Swatch boxes default to the 1:2 portrait ratio of a 12"x24" field
// tile; a color's `swatchAspect` overrides it (1 = square 12"x12"
// mosaic sheet). Cell dimensions are computed by
// brochure-layout.getSwatchLayout — never distort an image here.
const SWATCH_GAP = 12;
const ROW_GAP = 8;

export function ColorSwatchGrid({ rows }: { rows: SwatchCell[][] }) {
  const hasDeco = rows.some((row) => row.some((c) => c.color.decoImageUrl));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: `${ROW_GAP}px` }}>
      {rows.map((row, idx) => (
        <div key={idx}>
          <SwatchRow cells={row} />
          {hasDeco && <SwatchRow cells={row} deco />}
        </div>
      ))}
    </div>
  );
}

function SwatchRow({
  cells,
  deco = false,
}: {
  cells: SwatchCell[];
  deco?: boolean;
}) {
  return (
    <div
      className={deco ? "mt-2 flex justify-center" : "flex justify-center"}
      style={{ gap: `${SWATCH_GAP}px` }}
    >
      {cells.map(({ color: c, width, height }) => {
        const src = deco ? c.decoImageUrl ?? undefined : c.imageUrl;
        const label = deco ? `${c.trinityName} deco` : c.trinityName;
        return (
          <div
            key={c.trinityName + (deco ? "-deco" : "")}
            className="flex flex-col"
          >
            <div
              className="overflow-hidden bg-[#f3f3f3]"
              style={{ width, height }}
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
