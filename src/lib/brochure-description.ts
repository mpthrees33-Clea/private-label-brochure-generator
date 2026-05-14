// Render-time substitution for the brochure description.
//
// The AI scraper writes descriptions with a `{{name}}` token wherever
// the product name would appear, so the body stays in sync with the
// Trinity name at the top of the brochure (which changes per private-
// labeling). As a belt-and-suspenders safety net, any literal
// case-insensitive substring of the factory's product name is also
// replaced — that way an AI that forgets the token still can't leak a
// factory name into a Trinity-branded brochure.

const NAME_TOKEN = /\{\{\s*name\s*\}\}/g;

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function renderDescription(
  description: string,
  trinityName: string,
  factoryName?: string,
): string {
  // Lowercase the substitution to match Trinity's brand style (all
  // lowercase). The first character is naturally capitalized via
  // context — e.g. a sentence starting with the name gets capitalized
  // by tradition, but Trinity actually wants all-lowercase, so we keep
  // it lowercase throughout.
  const name = (trinityName || "").toLowerCase();
  let out = description.replace(NAME_TOKEN, name);
  if (factoryName) {
    const trimmed = factoryName.trim();
    if (trimmed.length >= 3) {
      const re = new RegExp(`\\b${escapeRegex(trimmed)}\\b`, "gi");
      out = out.replace(re, name);
    }
  }
  return out;
}
