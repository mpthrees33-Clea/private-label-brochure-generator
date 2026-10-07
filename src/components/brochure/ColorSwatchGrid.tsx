import type { BrochureColor } from "@/lib/brochure-types";
import { proxyImageUrl } from "@/lib/image-proxy";

// Tile swatches mimic a 12"x24" tile — aspect ratio MUST be 1:2.
// Never alter the ratio. If horizontal space runs out, the layout
// engine adds another primary row (see brochure-layout.computeSwatchLayout).
const SWATCH_GAP = 12;
const ROW_GAP = 8;

export function ColorSwatchGrid({
  colors,
  swatchWidth,
  swatchHeight,
  perRow,
  labelHeight = 22,
}: {
  colors: BrochureColor[];
  swatchWidth: number;
  swatchHeight: number;
  perRow: number;
  /** Reserved caption box. Long names wrap inside it and cannot paint over the size chart. */
  labelHeight?: number;
}) {
  const hasDeco = colors.some((c) => c.decoImageUrl && c.decoImageUrl.trim());
  const chunks: BrochureColor[][] = [];
  for (let i = 0; i < colors.length; i += perRow) {
    chunks.push(colors.slice(i, i + perRow));
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: `${ROW_GAP}px` }}>
      {chunks.map((row, idx) => (
        <div key={idx}>
          <SwatchRow
            colors={row}
            swatchWidth={swatchWidth}
            swatchHeight={swatchHeight}
            labelHeight={labelHeight}
          />
          {hasDeco && (
            <SwatchRow
              colors={row}
              swatchWidth={swatchWidth}
              swatchHeight={swatchHeight}
              labelHeight={labelHeight}
              deco
            />
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
  labelHeight,
  deco = false,
}: {
  colors: BrochureColor[];
  swatchWidth: number;
  swatchHeight: number;
  labelHeight: number;
  deco?: boolean;
}) {
  return (
    <div
      className={deco ? "mt-2 flex justify-center" : "flex justify-center"}
      style={{ gap: `${SWATCH_GAP}px` }}
    >
      {colors.map((c) => {
        const src = deco ? c.decoImageUrl ?? undefined : c.imageUrl;
        const baseName = c.trinityName.replace(/\s+deco$/i, "");
        const label = deco ? `${baseName} deco` : c.trinityName;
        if (deco && !src) {
          return (
            <div
              key={c.trinityName + "-deco-empty"}
              style={{ width: swatchWidth, height: swatchHeight }}
              aria-hidden
            />
          );
        }
        return (
          <div
            key={c.trinityName + (deco ? "-deco" : "")}
            className="flex flex-col"
            style={{ width: swatchWidth }}
          >
            <div
              className="aspect-[1/2] overflow-hidden bg-[#f3f3f3]"
              style={{ width: swatchWidth, height: swatchHeight }}
            >
              {src ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={proxyImageUrl(src)}
                  alt={label}
                  className="h-full w-full object-cover"
                  data-print-w={swatchWidth}
                  data-print-h={swatchHeight}
                  data-print-fit="cover"
                />
              ) : null}
            </div>
            <span
              className="lowercase text-brochure-gray"
              style={{
                display: "block",
                marginTop: 4,
                fontSize: 11,
                lineHeight: 1.15,
                maxHeight: Math.max(12, labelHeight - 4),
                overflow: "hidden",
              }}
            >
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
