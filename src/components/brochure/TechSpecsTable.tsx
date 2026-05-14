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
    <div>
      <h3 className="text-[12px] lowercase text-brochure-gray">
        technical specifications
      </h3>
      <table className="mt-1 w-full border-collapse text-[9px] lowercase">
        <thead>
          {/* Header band — Trinity gray with white text */}
          <tr className="bg-brochure-gray text-white">
            {cols.map((c) => (
              <th
                key={c.key}
                className="px-1.5 py-1 text-left font-normal align-bottom leading-tight"
              >
                {c.label}
              </th>
            ))}
          </tr>
          <tr className="text-brochure-gray">
            {cols.map((c) => (
              <td key={c.key} className="border-b border-brochure-line px-1.5 py-1">
                {c.standard}
              </td>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr className="text-brochure-gray">
            {cols.map((c) => (
              <td key={c.key} className="px-1.5 py-1">
                {specs[c.key]}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
