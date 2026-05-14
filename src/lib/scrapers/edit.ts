import Anthropic from "@anthropic-ai/sdk";
import type { BrochureData } from "../brochure-types";

const SYSTEM_PROMPT = `You are a brochure editor for Trinity Surfaces, a commercial-flooring distributor that private-labels every product. A sales rep is reviewing a generated brochure and giving you a plain-English instruction to change it.

You return the FULL updated BrochureData JSON — every field, not a diff — by calling apply_edit. Preserve every field the rep didn't ask to change. Also return a short changeSummary that describes the kind of correction (one short sentence, third person, present tense). The changeSummary is later shown to future generations as a learned rule, so phrase it as guidance, not history. Good: "Trim product descriptions to 2 short sentences focused on commercial use." Bad: "Made the description shorter."

Rules to never violate:
- trinityName is always a single lowercase word, never the factory's product name.
- All names (trinityName, color trinityNames) are lowercase.
- techSpecs values keep their printed units exactly ("≤ 0.5%", "≥ 450 lbf").
- Do not invent technical specs the rep didn't provide.
- description ALWAYS uses the literal token "{{name}}" (with curly braces) wherever the product name appears — never bake the current Trinity name into the saved string. If the description you receive has the current name written out, replace those occurrences with {{name}} before returning. This keeps the body and header in sync forever.`;

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
              enum: ["rectangle", "square", "plank", "mosaic", "bullnose"],
            },
            isDeco: { type: ["boolean", "null"] },
            footnoteRef: { type: ["string", "null"] },
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
  const { changeSummary, ...rest } = ext;
  return {
    data: rest as BrochureData,
    changeSummary: changeSummary || "Updated brochure based on rep instruction.",
  };
}
