import type { BrochureColor } from "@/lib/brochure-types";

// Fixed swatch height so page 2 fits on a single 1056px (Letter) sheet
// alongside the size matrix, finish legend, tech specs, and contact block.
// See feedback_brochure_two_pages memory: brochures MUST be exactly 2 pages.
const SWATCH_H = 175;

export function ColorSwatchGrid({ colors }: { colors: BrochureColor[] }) {
  const hasDeco = colors.some((c) => c.decoImageUrl);
  const cols = colors.length;
  const gridStyle = { gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` };

  return (
    <div className="px-[48px]">
      <div className="grid gap-x-3 gap-y-1" style={gridStyle}>
        {colors.map((c) => (
          <div key={c.trinityName} className="flex flex-col">
            <div
              className="w-full overflow-hidden bg-[#f3f3f3]"
              style={{ height: SWATCH_H }}
            >
              {c.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={c.imageUrl}
                  alt={c.trinityName}
                  className="h-full w-full object-cover"
                />
              ) : null}
            </div>
            <span className="mt-1 text-[11px] lowercase text-[#3a3a3a]">
              {c.trinityName}
            </span>
          </div>
        ))}
      </div>
      {hasDeco && (
        <div className="mt-2 grid gap-x-3 gap-y-1" style={gridStyle}>
          {colors.map((c) => (
            <div key={c.trinityName + "-deco"} className="flex flex-col">
              <div
                className="w-full overflow-hidden bg-[#f3f3f3]"
                style={{ height: SWATCH_H }}
              >
                {c.decoImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={c.decoImageUrl}
                    alt={`${c.trinityName} deco`}
                    className="h-full w-full object-cover"
                  />
                ) : null}
              </div>
              <span className="mt-1 text-[11px] lowercase text-[#3a3a3a]">
                {c.trinityName} deco
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
