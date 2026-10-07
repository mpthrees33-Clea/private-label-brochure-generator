// Private-label names are single lowercase US place names. Seed brochures
// already use kendall, lunett, oberlin, and torrance. A scrape must never
// persist the "rename-me" placeholder, and two products cannot share a name.

export const RESERVED_TRINITY_NAMES = new Set([
  "kendall",
  "lunett",
  "oberlin",
  "torrance",
]);

const PLACEHOLDERS = new Set(["", "rename", "renameme", "rename-me", "editme", "todo", "name"]);

/** Two-syllable US place names, in a stable order. */
const TOWN_POOL = [
  "ashland",
  "auburn",
  "bangor",
  "barstow",
  "benton",
  "bozeman",
  "bristol",
  "camden",
  "canton",
  "carson",
  "cheyenne",
  "concord",
  "dayton",
  "denton",
  "dover",
  "duluth",
  "eugene",
  "flint",
  "fresno",
  "galena",
  "hartford",
  "helena",
  "hoboken",
  "ithaca",
  "jackson",
  "keene",
  "laramie",
  "lexington",
  "madison",
  "medford",
  "naples",
  "ogden",
  "pasco",
  "quincy",
  "raleigh",
  "salem",
  "sedona",
  "tacoma",
  "tempe",
  "tulsa",
  "waco",
  "yakima",
  "ashford",
  "belmont",
  "caldwell",
  "calvert",
  "clayton",
  "dalton",
  "eldon",
  "fairfax",
  "gaston",
  "hanover",
  "irving",
  "jasper",
  "kingston",
  "lawton",
  "marion",
  "newton",
  "oakley",
  "prescott",
  "redmond",
  "spokane",
  "trenton",
  "utica",
  "vernon",
  "weston",
  "yorktown",
];

export function cleanTrinityName(raw: string | undefined | null): string {
  return (raw ?? "").toLowerCase().replace(/[^a-z]/g, "");
}

export function isPlaceholderName(raw: string | undefined | null): boolean {
  const cleaned = cleanTrinityName(raw);
  return PLACEHOLDERS.has(cleaned);
}

/**
 * Keep a suggested name when it is new. Otherwise take the next town that
 * is not reserved and not already saved on another product.
 */
export function chooseTrinityName(suggested: string | undefined | null, taken: Iterable<string>): string {
  const used = new Set<string>();
  for (const name of taken) {
    const cleaned = cleanTrinityName(name);
    if (cleaned) used.add(cleaned);
  }
  for (const reserved of RESERVED_TRINITY_NAMES) used.add(reserved);

  const cleaned = cleanTrinityName(suggested);
  if (cleaned && !isPlaceholderName(cleaned) && !used.has(cleaned)) return cleaned;

  for (const town of TOWN_POOL) {
    if (!used.has(town)) return town;
  }
  let n = used.size + 1;
  while (used.has(`town${n}`)) n += 1;
  return `town${n}`;
}
