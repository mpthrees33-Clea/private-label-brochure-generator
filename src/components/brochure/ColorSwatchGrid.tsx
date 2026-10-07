import type { BrochureColor, BrochureSize } from "@/lib/brochure-types";
import type { SwatchLayout } from "@/lib/brochure-layout";
import { proxyImageUrl } from "@/lib/image-proxy";
import { resolveSwatchFaces, swatchFit, type ResolvedFace } from "@/lib/swatch-geometry";

// Each color is a stack of its factory faces. The frame is the nominal
// size (square, long plank, upright 4×16, 12×24). The full-resolution
// photo is centered and cropped only to that ratio. A size we could not
// parse stays a neutral square and is flagged in the editor.
const SWATCH_GAP = 12;
const ROW_GAP = 8;

export function ColorSwatchGrid({
  colors,
  sizes = [],
  layout,
}: {
  colors: BrochureColor[];
  sizes?: BrochureSize[];
  layout: SwatchLayout;
}) {
  const groups = colors.map((color) => ({
    color,
    faces: resolveSwatchFaces(color, sizes),
  }));
  const chunks: typeof groups[] = [];
  for (let i = 0; i < groups.length; i += layout.perRow) {
    chunks.push(groups.slice(i, i + layout.perRow));
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: `${ROW_GAP}px` }}>
      {chunks.map((row, idx) => (
        <div key={idx} className="flex justify-center" style={{ gap: `${SWATCH_GAP}px` }}>
          {row.map((group) => (
            <ColorGroup
              key={group.color.trinityName}
              name={group.color.trinityName}
              faces={group.faces}
              width={layout.width}
              labelHeight={layout.labelHeight}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function ColorGroup({
  name,
  faces,
  width,
  labelHeight,
}: {
  name: string;
  faces: ResolvedFace[];
  width: number;
  labelHeight: number;
}) {
  return (
    <div className="flex flex-col" style={{ width, gap: `${ROW_GAP}px` }}>
      {faces.map((face, index) => {
        const height = Math.max(8, Math.round(width / face.ratio));
        const fit = swatchFit(face.ratio, face.photoWidth, face.photoHeight, face.sizeUnknown);
        return (
          <div key={`${name}-${index}`} className="flex flex-col">
            <div
              className="flex items-center justify-center overflow-hidden bg-[#f3f3f3]"
              style={{ width, height }}
            >
              {face.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={proxyImageUrl(face.imageUrl)}
                  alt={face.caption}
                  className={
                    fit === "cover"
                      ? "h-full w-full object-cover object-center"
                      : "max-h-full max-w-full object-contain object-center"
                  }
                  data-print-w={width}
                  data-print-h={height}
                  data-print-fit={fit}
                />
              ) : (
                <span className="px-1 text-center text-[9px] uppercase tracking-wide text-[#9a9a9a]">
                  no photo
                </span>
              )}
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
              {face.caption}
            </span>
          </div>
        );
      })}
    </div>
  );
}
