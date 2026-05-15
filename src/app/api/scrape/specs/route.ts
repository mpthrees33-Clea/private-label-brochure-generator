import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import * as cheerio from "cheerio";
import type { TechSpecs } from "@/lib/brochure-types";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

// POST /api/scrape/specs { url } — manually scrape tech specs from a
// URL the rep pastes. Used when the factory hides specs in a downloads
// section or PDF that our anchor-based discovery missed (e.g. JS-rendered
// downloads, Portobello-style hidden brochure links).

const SYSTEM_PROMPT = `Extract the technical specifications table from the supplied document (HTML or PDF).

Return values in the SAME short form Trinity Surfaces brochures use. Strip all commentary, parentheticals, and footnote markers. Allowed patterns ONLY:
- thickness: "8mm" | "9mm" | "9.5mm" | "6mm - 9.5mm" | "9.5mm | 8.5mm"
- shadeVariation: "v1" | "v2" | "v3" | "v4" | "v2-v3"
- waterAbsorption: "≤ 0.5%" | "≤ 0.1%"
- frostResistance: "resistant"
- stainResistance: "resistant" | "class 5"
- chemicalResistance: "resistant" | "class a"
- scratchHardness: "7" | "8" (single digit only, no "Mohs" prefix)
- breakingStrength: "≥ 450 lbf" | "≥ 250 lbs"
- dcof: "≥ 0.42 wet" | "≥ 0.50 wet" | "matte ≥ 0.50 wet | grip ≥ 0.55 wet"

Use null for any spec not stated.`;

const TOOL_SCHEMA = {
  name: "extract_tech_specs",
  description: "Extracts the technical specs from a spec sheet document.",
  input_schema: {
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
} as const;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const url = body?.url;
  if (typeof url !== "string" || !/^https?:\/\//i.test(url)) {
    return NextResponse.json(
      { error: "url is required (http(s)://...)" },
      { status: 400 },
    );
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY not configured on the server" },
      { status: 500 },
    );
  }

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        Accept: "*/*",
      },
      redirect: "follow",
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: `Fetch failed: ${res.status} ${res.statusText}` },
        { status: 502 },
      );
    }
    const contentType = (res.headers.get("content-type") ?? "").toLowerCase();
    const isPdf =
      contentType.includes("application/pdf") ||
      url.toLowerCase().endsWith(".pdf");

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    let toolInput: Partial<TechSpecs> | null = null;

    if (isPdf) {
      const bytes = await res.arrayBuffer();
      if (bytes.byteLength > 32 * 1024 * 1024) {
        return NextResponse.json(
          { error: "PDF too large (>32MB)" },
          { status: 413 },
        );
      }
      const base64 = Buffer.from(bytes).toString("base64");
      const message = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        tools: [TOOL_SCHEMA as unknown as Anthropic.Tool],
        tool_choice: { type: "tool", name: "extract_tech_specs" },
        messages: [
          {
            role: "user",
            content: [
              {
                type: "document",
                source: {
                  type: "base64",
                  media_type: "application/pdf",
                  data: base64,
                },
              } as unknown as Anthropic.TextBlockParam,
              {
                type: "text",
                text: "Extract every tech-spec value listed in this document.",
              },
            ],
          },
        ],
      });
      const tu = message.content.find((c) => c.type === "tool_use");
      if (tu && tu.type === "tool_use") toolInput = tu.input as Partial<TechSpecs>;
    } else {
      const html = await res.text();
      const $ = cheerio.load(html);
      $("script, style, noscript, nav, header, footer").remove();
      const text = ($("body").text() || "").replace(/\s+/g, " ").trim().slice(0, 60_000);
      const message = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        tools: [TOOL_SCHEMA as unknown as Anthropic.Tool],
        tool_choice: { type: "tool", name: "extract_tech_specs" },
        messages: [
          {
            role: "user",
            content: `Spec page URL: ${url}\n\n${text}`,
          },
        ],
      });
      const tu = message.content.find((c) => c.type === "tool_use");
      if (tu && tu.type === "tool_use") toolInput = tu.input as Partial<TechSpecs>;
    }

    if (!toolInput) {
      return NextResponse.json(
        { error: "Could not extract any specs from that URL." },
        { status: 422 },
      );
    }
    return NextResponse.json({ techSpecs: toolInput });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
