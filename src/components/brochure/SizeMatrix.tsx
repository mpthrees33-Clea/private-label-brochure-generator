import type { BrochureColor, BrochureSize } from "@/lib/brochure-types";
import { SizeIcon } from "./SizeIcon";
import { FinishMarker } from "./FinishMarker";

export function SizeMatrix({
  sizes,
  colors,
  availability,
  finishLegend,
}: {
  sizes: BrochureSize[];
  colors: BrochureColor[];
  availability: Record<string, string[]>;
  /** Global finish legend — used as the default for any size that
   *  doesn't override via `finishes`. */
  finishLegend: string[];
}) {
  return (
    <div>
      <h3 className="text-[12px] lowercase text-brochure-gray">sizes</h3>
      <table className="mt-1 w-full border-collapse text-[10px] lowercase leading-tight text-brochure-gray">
        <thead>
          <tr>
            <th className="w-[18%]" />
            {sizes.map((s) => (
              <th
                key={s.label}
                className="border-b border-brochure-line px-1 pb-1.5 text-center align-bottom font-normal"
              >
                <div className="flex flex-col items-center gap-0.5">
                  <SizeIcon kind={s.iconKind} />
                  <span>
                    {s.label}
                    {s.footnoteRef ?? ""}
                    {s.isDeco ? " deco" : ""}
                  </span>
                  {s.thickness && (
                    <span className="text-[9px] text-brochure-muted">
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
              <tr key={c.trinityName} className="border-b border-brochure-line">
                <td className="py-1 text-left">{c.trinityName}</td>
                {sizes.map((s) => {
                  const key = s.label + (s.isDeco ? " deco" : "");
                  const hit = avail.includes(key) || avail.includes(s.label);
                  // Per-size override beats the global legend. Empty
                  // arrays are treated as "use the default" — we don't
                  // want a stray [] to wipe markers from a real cell.
                  const cellFinishes =
                    s.finishes && s.finishes.length > 0 ? s.finishes : finishLegend;
                  return (
                    <td key={s.label} className="py-1 text-center">
                      {hit ? (
                        <span className="inline-flex items-center justify-center gap-0.5">
                          {cellFinishes.map((f) => (
                            <FinishMarker key={f} finish={f} />
                          ))}
                        </span>
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
  );
}
