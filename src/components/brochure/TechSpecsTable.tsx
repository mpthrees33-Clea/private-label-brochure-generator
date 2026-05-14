import type { TechSpecs } from "@/lib/brochure-types";

const COLUMNS: { key: keyof TechSpecs; label: string; standard: string }[] = [
  { key: "thickness", label: "nominal thickness", standard: "-" },
  { key: "shadeVariation", label: "shade variation", standard: "-" },
  { key: "waterAbsorption", label: "water absorption", standard: "C373" },
  { key: "frostResistance", label: "frost resistance", standard: "C1026" },
  { key: "stainResistance", label: "stain resistance", standard: "C1378" },
  { key: "chemicalResistance", label: "chemical resistance", standard: "C650" },
  { key: "scratchHardness", label: "scratch hardness", standard: "Mohs" },
  { key: "breakingStrength", label: "breaking strength", standard: "C648" },
  { key: "dcof", label: "dynamic coefficient of friction", standard: "A326.3" },
];

// Pinned inside a 168px-tall absolute-positioned bottom row. The table
// uses table-layout: fixed and equal column widths so a long data value
// (e.g. Oberlin's multi-line DCOF) cannot squeeze other columns out of
// the row. Cells wrap on whitespace; words longer than a column break
// mid-word rather than overflow.
export function TechSpecsTable({ specs }: { specs: Partial<TechSpecs> }) {
  const cols = COLUMNS.filter((c) => specs[c.key]);
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
          {/* Gray label band */}
          <tr className="bg-brochure-gray text-white">
            {cols.map((c) => (
              <th
                key={c.key}
                className="px-1 py-1 text-left font-normal align-top break-words"
              >
                {c.label}
              </th>
            ))}
          </tr>
          {/* Standard codes */}
          <tr className="text-brochure-gray">
            {cols.map((c) => (
              <td
                key={c.key}
                className="border-b border-brochure-line px-1 py-1 align-top break-words"
              >
                {c.standard}
              </td>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr className="text-brochure-gray">
            {cols.map((c) => (
              <td
                key={c.key}
                className="px-1 py-1 align-top break-words"
              >
                {specs[c.key]}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
