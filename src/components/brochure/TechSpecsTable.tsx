import type { TechSpecs } from "@/lib/brochure-types";
import { visibleTechSpecColumns } from "@/lib/tech-spec-columns";

// Pinned inside a 168px-tall absolute-positioned bottom row. The table
// uses table-layout: fixed and equal column widths so a long data value
// cannot squeeze other columns out of the row. The test method lives in
// the gray header ("water absorption (ASTM C373)"), and there is a
// single values row. Thickness and shade variation have no standard.
export function TechSpecsTable({ specs }: { specs: Partial<TechSpecs> }) {
  const cols = visibleTechSpecColumns(specs);
  if (cols.length === 0) return null;
  return (
    <div className="overflow-hidden">
      <h3 className="text-[12px] lowercase text-brochure-gray">
        technical specifications
      </h3>
      <table
        className="mt-1 w-full border-collapse text-[9px] lowercase leading-tight"
        style={{ tableLayout: "fixed" }}
      >
        <colgroup>
          {cols.map((c) => (
            <col key={c.key} style={{ width: `${100 / cols.length}%` }} />
          ))}
        </colgroup>
        <thead>
          <tr className="bg-brochure-gray text-white">
            {cols.map((c) => (
              <th
                key={c.key}
                className="px-1 py-1 text-left font-normal align-top break-words normal-case"
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr className="text-brochure-gray">
            {cols.map((c) => (
              <td key={c.key} className="px-1 py-1 align-top break-words">
                {specs[c.key]}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
