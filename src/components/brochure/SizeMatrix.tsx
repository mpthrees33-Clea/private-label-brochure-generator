import type { BrochureColor, BrochureSize } from "@/lib/brochure-types";
import { sizeAvailable, sizeChartLabel } from "@/lib/scrapers/size-format";
import { SizeIcon } from "./SizeIcon";
import { FinishMarker } from "./FinishMarker";

export function SizeMatrix({
  sizes,
  colors,
  availability,
  availabilityFinishes,
  finishLegend,
}: {
  sizes: BrochureSize[];
  colors: BrochureColor[];
  availability: Record<string, string[]>;
  availabilityFinishes?: Record<string, Record<string, string[]>>;
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
            {sizes.map((s, i) => (
              <th
                key={`${sizeChartLabel(s)}-${i}`}
                className="border-b border-brochure-line px-1 pb-1.5 text-center align-bottom font-normal"
              >
                <div className="flex flex-col items-center gap-0.5">
                  <SizeIcon kind={s.iconKind} />
                  <span>
                    {sizeChartLabel(s)}
                    {s.footnoteRef ?? ""}
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
                {sizes.map((s, i) => {
                  const chart = sizeChartLabel(s);
                  const hit = sizeAvailable(s, avail);
                  const perCell = availabilityFinishes?.[c.trinityName]?.[chart];
                  // Per-color finish (cream is glossy only) beats per-size,
                  // which beats the global legend. Empty arrays fall through
                  // so a stray [] can't wipe markers.
                  const cellFinishes =
                    perCell && perCell.length > 0
                      ? perCell
                      : s.finishes && s.finishes.length > 0
                        ? s.finishes
                        : finishLegend;
                  return (
                    <td key={`${chart}-${i}`} className="py-1 text-center">
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
