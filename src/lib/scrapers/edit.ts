import Anthropic from "@anthropic-ai/sdk";
import type { BrochureData } from "../brochure-types";

const SYSTEM_PROMPT = `You are a brochure editor for Trinity Surfaces, a commercial-flooring distributor that private-labels every product. A sales rep is reviewing a generated brochure and giving you a plain-English instruction to change it.

You return the FULL updated BrochureData JSON — every field, not a diff — by calling apply_edit. Preserve every field the rep didn't ask to change. Also return a short changeSummary that describes the kind of correction (one short sentence, third person, present tense). The changeSummary is later shown to future generations as a learned rule, so phrase it as guidance, not history. Good: "Trim product descriptions to 2 short sentences focused on commercial use." Bad: "Made the description shorter."

Rules to never violate:
- trinityName is always a single lowercase word, never the factory's product name.
- All names (trinityName, color trinityNames) are lowercase.
- techSpecs values keep their printed units exactly ("≤ 0.5%", "≥ 450 lbf").
- Do not invent technical specs the rep didn't provide.
- description ALWAYS uses the literal token "{{name}}" (with curly braces) wherever the product name appears — never bake the current Trinity name into the saved string. If the description you receive has the current name written out, replace those occurrences with {{name}} before returning. This keeps the body and header in sync forever.

CRITICAL — visual field map. The rep describes the brochure visually. Map their words to the right JSON field:
- "size chart", "sizes chart", "availability matrix", "the chart", "the grid", "the dots", "the dots in the chart" → \`availability\` (a record mapping color name → list of size labels that color is offered in). Adding/removing dots means adding/removing entries from this object.
- "the legend", "the matte/grip legend", "the bullets at the bottom of the size chart", "finish bullets" → \`finishLegend\` (typically just ["matte"] or ["matte", "textured"] or ["matte", "grip"]).
- "the swatch row", "the swatches", "color tiles" → \`colors\` (and their \`trinityName\` / \`imageUrl\` fields).
- "the swatches are stretched / cropped wrong / should be square", "make the swatches square" → \`colors[].swatchAspect\` (swatch box width ÷ height: 1 = square 12"x12" mosaic sheet, 0.5 or null = default portrait 12"x24" field tile). Set it from the NOMINAL tile/sheet size the rep describes.
- "one row per format", "group the swatches by format/pattern", "3 rows like the factory site" → \`colors[].rowGroup\` (the format name, identical string for every color of that format — e.g. "squares", "penny round", "stacked") plus the ORDER of the colors array (rows follow first-appearance order of rowGroup values, format-major).
- "the little size diagram", "the penny round icon", "the icon above the size chart" → \`sizes[].iconKind\` ("mosaic" = square-grid sheet, "mosaic-penny" = penny-round dots, "mosaic-stacked" = stacked kit-kat sticks).
- "tech specs", "technical specifications", "the spec table" → \`techSpecs\`.
- "footnotes", "the asterisk text", "the note under the chart" → \`footnotes\`.
- "header", "title", "tagline", "name" → \`trinityName\` or \`trinityTagline\`.
- "description", "body copy", "intro" → \`description\`.

NEVER touch \`finishLegend\` unless the rep specifically asks about the "legend" or the small bullets that say "matte" / "grip" / "textured" at the bottom of page 2. Words like "matte" and "grip" can also refer to availability — when in doubt, the rep means \`availability\`, not \`finishLegend\`.`;

const APPLY_EDIT_TOOL = {
  name: "apply_edit",
  description:
    "Return the full updated BrochureData after applying the rep's instruction, plus a short generalizable changeSummary suitable to be remembered as a future rule.",
  input_schema: {
    type: "object",
    properties: {
      trinityName: { type: "string" },
      trinityTagline: { type: "string" },
      description: { type: "string" },
      heroImageUrl: { type: "string" },
      colors: {
        type: "array",
        items: {
          type: "object",
          properties: {
            trinityName: { type: "string" },
            imageUrl: { type: "string" },
            decoImageUrl: { type: ["string", "null"] },
            swatchAspect: {
              type: ["number", "null"],
              description:
                'Swatch box width ÷ height. null/0.5 = default portrait 12"x24" field tile. 1 = square 12"x12" mosaic sheet. Always from the nominal tile/sheet size, never the photo crop.',
            },
            rowGroup: {
              type: ["string", "null"],
              description:
                "Format grouping: identical string for every color of the same format (e.g. \"penny round\") renders one swatch row-band per format. null for single-format products.",
            },
          },
          required: ["trinityName", "imageUrl"],
        },
      },
      sizes: {
        type: "array",
        items: {
          type: "object",
          properties: {
            label: { type: "string" },
            thickness: { type: ["string", "null"] },
            iconKind: {
              type: "string",
              enum: [
                "rectangle",
                "square",
                "plank",
                "mosaic",
                "mosaic-penny",
                "mosaic-stacked",
                "bullnose",
              ],
            },
            isDeco: { type: ["boolean", "null"] },
            footnoteRef: { type: ["string", "null"] },
            finishes: {
              type: ["array", "null"],
              items: { type: "string" },
              description:
                'OPTIONAL — per-size finish restriction (e.g. ["grip"] for an outdoor paver, ["textured"] for a deco). Leave null for sizes that come in the full finishLegend.',
            },
          },
          required: ["label", "iconKind"],
        },
      },
      availability: {
        type: "object",
        additionalProperties: { type: "array", items: { type: "string" } },
      },
      finishLegend: { type: "array", items: { type: "string" } },
      footnotes: { type: "array", items: { type: "string" } },
      techSpecs: {
        type: "object",
        properties: {
          thickness: { type: ["string", "null"] },
          shadeVariation: { type: ["string", "null"] },
          waterAbsorption: { type: ["string", "null"] },
          frostResistance: { type: ["string", "null"] },
          stainResistance: { type: ["string", "null"] },
          chemicalResistance: { type: ["string", "null"] },
          scratchHardness: { type: ["string", "null"] },
          breakingStrength: { type: ["string", "null"] },
          dcof: { type: ["string", "null"] },
        },
      },
      changeSummary: {
        type: "string",
        description:
          "One short generalizable rule, third-person present tense, e.g. 'Trim product descriptions to 2 short sentences focused on commercial use.'",
      },
    },
    additionalProperties: false,
    required: [
      "trinityName",
      "trinityTagline",
      "description",
      "heroImageUrl",
      "colors",
      "sizes",
      "availability",
      "finishLegend",
      "footnotes",
      "techSpecs",
      "changeSummary",
    ],
  },
} as const;

export interface EditResult {
  data: BrochureData;
  changeSummary: string;
}

export async function applyBrochureEdit(
  current: BrochureData,
  instruction: string,
): Promise<EditResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not set on the server.");
  }
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    tools: [APPLY_EDIT_TOOL as unknown as Anthropic.Tool],
    tool_choice: { type: "tool", name: "apply_edit" },
    messages: [
      {
        role: "user",
        content: `Current brochure data:
\`\`\`json
${JSON.stringify(current, null, 2)}
\`\`\`

Rep instruction:
${instruction}`,
      },
    ],
  });
  const tu = message.content.find((c) => c.type === "tool_use");
  if (!tu || tu.type !== "tool_use") {
    throw new Error("Claude did not return an apply_edit tool call.");
  }
  const ext = tu.input as unknown as { changeSummary: string } & BrochureData;
  // Explicit pick-list, never a spread: guarantees a stray key from the
  // model (e.g. layoutOverrides) can't reach the store and clobber state
  // the rep set elsewhere, like drag positions.
  const data: BrochureData = {
    trinityName: ext.trinityName,
    trinityTagline: ext.trinityTagline,
    description: ext.description,
    heroImageUrl: ext.heroImageUrl,
    colors: ext.colors,
    sizes: ext.sizes,
    availability: ext.availability,
    finishLegend: ext.finishLegend,
    footnotes: ext.footnotes,
    techSpecs: ext.techSpecs,
  };
  return {
    data,
    changeSummary:
      ext.changeSummary || "Updated brochure based on rep instruction.",
  };
}
