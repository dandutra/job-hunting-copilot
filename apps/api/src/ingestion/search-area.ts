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
]);

// Lowercase words separated by single spaces, so a name matches only at word edges.
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

function entryInArea(location: string): boolean {
  const tokens = words(location);
  if (CITIES.some((city) => hasPhrase(tokens, city))) return true;
  if (!tokens.includes("remote")) return false;
  if (tokens.includes("canada") || tokens.includes("ontario")) return true;
  // Any other word is a place we cannot judge, so it keeps the row out.
  return tokens.every((t) => REMOTE_FILLER.has(t));
}

// A caller splits multi-location text itself; a string holding several places still passes if one is in.
export function inSearchArea(locations: string[]): boolean {
  return locations.some(entryInArea);
}
