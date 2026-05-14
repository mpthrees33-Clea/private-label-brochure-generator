import type { BrochureColor } from "@/lib/brochure-types";

export function ColorSwatchGrid({ colors }: { colors: BrochureColor[] }) {
  const hasDeco = colors.some((c) => c.decoImageUrl);
  const cols = colors.length;
  const gridStyle = { gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` };

  return (
    <div className="px-[48px]">
      <div className="grid gap-x-3 gap-y-1" style={gridStyle}>
        {colors.map((c) => (
          <div key={c.trinityName} className="flex flex-col">
            <div className="aspect-[3/4] w-full overflow-hidden bg-[#f3f3f3]">
              {c.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={c.imageUrl}
                  alt={c.trinityName}
                  className="h-full w-full object-cover"
                />
              ) : null}
            </div>
            <span className="mt-1.5 text-[11px] lowercase text-[#3a3a3a]">
              {c.trinityName}
            </span>
          </div>
        ))}
      </div>
      {hasDeco && (
        <div className="mt-2 grid gap-x-3 gap-y-1" style={gridStyle}>
          {colors.map((c) => (
            <div key={c.trinityName + "-deco"} className="flex flex-col">
              <div className="aspect-[3/4] w-full overflow-hidden bg-[#f3f3f3]">
                {c.decoImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={c.decoImageUrl}
                    alt={`${c.trinityName} deco`}
                    className="h-full w-full object-cover"
                  />
                ) : null}
              </div>
              <span className="mt-1.5 text-[11px] lowercase text-[#3a3a3a]">
                {c.trinityName} deco
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
