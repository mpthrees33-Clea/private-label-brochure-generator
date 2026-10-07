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
 * Generated names also have to sit apart from names already in the catalog
 * (halden / halvern / halsted are too close to tell apart on a shelf).
 */
export function chooseTrinityName(
  suggested: string | undefined | null,
  taken: Iterable<string>,
  options?: { separate?: boolean },
): string {
  const used = new Set<string>();
  for (const name of taken) {
    const cleaned = cleanTrinityName(name);
    if (cleaned) used.add(cleaned);
  }
  for (const reserved of RESERVED_TRINITY_NAMES) used.add(reserved);

  const blocked = (name: string) =>
    used.has(name) || (options?.separate && [...used].some((existing) => namesTooClose(name, existing)));

  const cleaned = cleanTrinityName(suggested);
  if (cleaned && !isPlaceholderName(cleaned) && !blocked(cleaned)) return cleaned;

  for (const town of TOWN_POOL) {
    if (!blocked(town)) return town;
  }
  let n = used.size + 1;
  while (blocked(`town${n}`)) n += 1;
  return `town${n}`;
}

function namesTooClose(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length < 5 || b.length < 5) return false;
  const prefix = sharedPrefix(a, b);
  const distance = levenshtein(a, b);
  if (prefix >= 4) return true;
  if (prefix >= 3 && distance <= 4) return true;
  return distance <= 2;
}

function sharedPrefix(a: string, b: string): number {
  const limit = Math.min(a.length, b.length);
  let i = 0;
  while (i < limit && a[i] === b[i]) i += 1;
  return i;
}

function levenshtein(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let corner = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const next = a[i - 1] === b[j - 1] ? corner : Math.min(corner, prev[j - 1], prev[j]) + 1;
      corner = prev[j];
      prev[j] = next;
    }
  }
  return prev[b.length];
}
