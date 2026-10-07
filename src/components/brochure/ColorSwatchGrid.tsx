import type { BrochureColor, BrochureSize } from "@/lib/brochure-types";
import type { SwatchLayout } from "@/lib/brochure-layout";
import { proxyImageUrl } from "@/lib/image-proxy";
import { nominalUnits, resolveSwatchFaces, swatchFit, type ResolvedFace } from "@/lib/swatch-geometry";

// Each color is a stack of its factory faces, drawn at one inch scale
// so a 3×16 plank is wider than the 8×8 deco beside it. The photo is
// trimmed and cropped to that frame when it already matches the tile.
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
              layout={layout}
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
  layout,
}: {
  name: string;
  faces: ResolvedFace[];
  layout: SwatchLayout;
}) {
  const boxes = faces.map((face) => faceBox(face, layout));
  const column = Math.max(8, ...boxes.map((box) => box.width));
  return (
    <div className="flex flex-col items-center" style={{ width: column, gap: `${ROW_GAP}px` }}>
      {faces.map((face, index) => {
        const box = boxes[index];
        const fit = swatchFit(
          face.ratio,
          face.photoWidth,
          face.photoHeight,
          face.sizeUnknown,
          face.photoMismatch,
        );
        return (
          <div key={`${name}-${index}`} className="flex flex-col items-center" style={{ width: column }}>
            <div
              className="flex items-center justify-center overflow-hidden bg-[#f3f3f3]"
              style={{ width: box.width, height: box.height }}
            >
              {face.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={proxyImageUrl(face.imageUrl, { trim: true })}
                  alt={face.caption}
                  className={
                    fit === "cover"
                      ? "h-full w-full object-cover object-center"
                      : "max-h-full max-w-full object-contain object-center"
                  }
                  data-print-w={box.width}
                  data-print-h={box.height}
                  data-print-fit={fit}
                  data-print-trim="1"
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
                width: column,
                marginTop: 4,
                fontSize: 11,
                lineHeight: 1.15,
                maxHeight: Math.max(12, layout.labelHeight - 4),
                overflow: "hidden",
                textAlign: "center",
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

function faceBox(face: ResolvedFace, layout: SwatchLayout): { width: number; height: number } {
  const widthIn = face.sizeUnknown ? layout.unitFallback || null : face.widthIn;
  const heightIn = face.sizeUnknown ? layout.unitFallback || null : face.heightIn;
  const units = nominalUnits(face.ratio, widthIn, heightIn);
  const scale = layout.scale > 0 ? layout.scale : layout.width / Math.max(units.w, 0.01);
  return {
    width: Math.max(8, Math.round(scale * units.w)),
    height: Math.max(8, Math.round(scale * units.h)),
  };
}
