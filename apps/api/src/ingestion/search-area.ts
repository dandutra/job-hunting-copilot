const CITIES = [
  "toronto",
  "mississauga",
  "brampton",
  "markham",
  "vaughan",
  "richmond hill",
  "oakville",
  "milton",
  "pickering",
  "ajax",
  "whitby",
  "oshawa",
  "newmarket",
  "aurora",
];

// Words that can sit beside "remote" without naming a place.
const REMOTE_FILLER = new Set([
  "remote",
  "hybrid",
  "wfh",
  "work",
  "from",
  "home",
  "anywhere",
  "fully",
  "flexible",
  "distributed",
  "telecommute",
  "worldwide",
  "global",
  "globally",
  "international",
]);

// "can" and "on" are also English words, so they name Canada or Ontario only where a place code sits; "ca" also means California.
const CANADA_CODES = new Set(["can", "on"]);
// A dash joins a code only to another code or to spaced text, so "On-site" and "Add-on" are words, not Ontario.
const CODE_SEP_BEFORE = /(^|[,(;/|]\s*|\s[-–—]\s*|(^|[^a-z0-9])(can|on)[-–—])$/;
const CODE_SEP_AFTER =
  /^\s*($|[,);/|.]|[-–—](\s|$|(can|on|remote)([^a-z0-9]|$)))/;

function words(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function hasPhrase(tokens: string[], phrase: string): boolean {
  const target = phrase.split(" ");
  return tokens.some((_, i) => target.every((w, j) => tokens[i + j] === w));
}

function hasCanadaCode(text: string): boolean {
  const lower = text.toLowerCase();
  for (const m of lower.matchAll(/[a-z0-9]+/g)) {
    if (!CANADA_CODES.has(m[0])) continue;
    const before = lower.slice(0, m.index);
    const after = lower.slice(m.index + m[0].length);
    if (CODE_SEP_BEFORE.test(before) && CODE_SEP_AFTER.test(after)) return true;
  }
  return false;
}

function entryInArea(location: string): boolean {
  const tokens = words(location);
  if (CITIES.some((city) => hasPhrase(tokens, city))) return true;
  if (!tokens.includes("remote")) return false;
  if (tokens.includes("canada") || tokens.includes("ontario")) return true;
  if (hasCanadaCode(location)) return true;
  // Any other word is a place we cannot judge, so it keeps the row out.
  return tokens.every((t) => REMOTE_FILLER.has(t));
}

// A caller splits multi-location text itself.
export function inSearchArea(locations: string[]): boolean {
  return locations.some(entryInArea);
}
