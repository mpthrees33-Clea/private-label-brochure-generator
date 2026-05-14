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

export function TechSpecsTable({ specs }: { specs: Partial<TechSpecs> }) {
  // Hide columns with no value (e.g. Torrance drops scratch hardness)
  const cols = COLUMNS.filter((c) => specs[c.key]);
  return (
    <div className="px-[48px]">
      <h3 className="text-[14px] lowercase text-[#3a3a3a]">
        technical specifications
      </h3>
      <table className="mt-2 w-full border-collapse text-[10px] lowercase">
        <thead>
          <tr className="bg-[#cfe1ec] text-[#3a3a3a]">
            {cols.map((c) => (
              <th
                key={c.key}
                className="px-2 py-1.5 text-left font-normal align-bottom"
              >
                {c.label}
              </th>
            ))}
          </tr>
          <tr className="text-[#3a3a3a]">
            {cols.map((c) => (
              <td key={c.key} className="border-b border-[#e0e0e0] px-2 py-1">
                {c.standard}
              </td>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr className="text-[#1a1a1a]">
            {cols.map((c) => (
              <td key={c.key} className="px-2 py-1.5">
                {specs[c.key]}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
