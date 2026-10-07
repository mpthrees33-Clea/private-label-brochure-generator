import type { BrochureColor, BrochureSize } from "@/lib/brochure-types";
import { sizeAvailable, sizeChartLabel } from "@/lib/scrapers/size-format";
import { SizeIcon } from "./SizeIcon";
import { FinishMarker } from "./FinishMarker";

function headingLines(label: string): { primary: string; note: string | null } {
  const sheet = label.match(/^(.*?)\s*(\([^)]*sheet\))\s*$/i);
  const body = sheet ? sheet[1].trim() : label;
  const sheetNote = sheet ? sheet[2] : null;
  const match = body.match(/^(.*\S)\s+(bullnose|deco|mosaic)$/i);
  if (!match && !sheetNote) return { primary: label, note: null };
  if (!match) return { primary: body, note: sheetNote };
  const qualifier = match[2].toLowerCase();
  const note = sheetNote ? `${qualifier} ${sheetNote}` : qualifier;
  return { primary: match[1], note };
}

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
  // Six size columns (field + bullnose on a wall line) wrap "bullnose"
  // into the next line mid-word at 10px. Split the qualifier onto its
  // own nowrap line and shrink the icons so each column stays readable.
  const compact = sizes.length >= 6;
  return (
    <div>
      <h3 className="text-[12px] lowercase text-brochure-gray">sizes</h3>
      <table
        className={`mt-1 w-full border-collapse lowercase leading-tight text-brochure-gray ${
          compact ? "table-fixed text-[9px]" : "text-[10px]"
        }`}
      >
        <thead>
          <tr>
            <th className={compact ? "w-[88px]" : "w-[18%]"} />
            {sizes.map((s, i) => {
              const label = sizeChartLabel(s);
              const lines =
                compact || /sheet/i.test(label)
                  ? headingLines(label)
                  : { primary: label, note: null as string | null };
              return (
              <th
                key={`${label}-${i}`}
                className={`border-b border-brochure-line pb-1.5 text-center align-bottom font-normal ${
                  compact ? "px-0.5" : "px-1"
                }`}
              >
                <div className="flex flex-col items-center gap-0.5">
                  <SizeIcon kind={s.iconKind} compact={compact} />
                  <span className={compact ? "block whitespace-nowrap leading-none" : undefined}>
                    {lines.primary}
                    {s.footnoteRef ?? ""}
                  </span>
                  {lines.note && (
                    <span
                      className={`block whitespace-nowrap leading-none ${
                        compact ? "text-[8px]" : "text-[9px]"
                      }`}
                    >
                      {lines.note}
                    </span>
                  )}
                  {s.thickness && (
                    <span className="whitespace-nowrap text-[8px] leading-none text-brochure-muted">
                      {s.thickness}
                    </span>
                  )}
                </div>
              </th>
              );
            })}
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
