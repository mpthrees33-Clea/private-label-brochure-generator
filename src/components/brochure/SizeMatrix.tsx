import type { BrochureColor, BrochureSize } from "@/lib/brochure-types";
import { SizeIcon } from "./SizeIcon";

export function SizeMatrix({
  sizes,
  colors,
  availability,
}: {
  sizes: BrochureSize[];
  colors: BrochureColor[];
  availability: Record<string, string[]>;
}) {
  return (
    <div className="px-[48px]">
      <h3 className="text-[14px] lowercase text-[#3a3a3a]">sizes</h3>
      <div className="mt-2">
        <table className="w-full border-collapse text-[11px] lowercase text-[#3a3a3a]">
          <thead>
            <tr>
              <th className="w-[20%]" />
              {sizes.map((s) => (
                <th
                  key={s.label}
                  className="border-b border-[#e0e0e0] px-1 pb-2 text-center align-bottom font-normal"
                >
                  <div className="flex flex-col items-center gap-1">
                    <SizeIcon kind={s.iconKind} />
                    <span>
                      {s.label}
                      {s.footnoteRef ? s.footnoteRef : ""}
                      {s.isDeco ? " deco" : ""}
                    </span>
                    {s.thickness && (
                      <span className="text-[10px] text-[#6a6a6a]">
                        {s.thickness}
                      </span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {colors.map((c) => {
              const avail = availability[c.trinityName] ?? [];
              return (
                <tr key={c.trinityName} className="border-b border-[#e0e0e0]">
                  <td className="py-2 text-left">{c.trinityName}</td>
                  {sizes.map((s) => {
                    const key = s.label + (s.isDeco ? " deco" : "");
                    const hit = avail.includes(key) || avail.includes(s.label);
                    return (
                      <td key={s.label} className="py-2 text-center">
                        {hit ? (
                          <span className="inline-block h-2 w-2 rounded-full bg-[#1a1a1a]" />
                        ) : null}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
