import { similarity } from "../companies/similarity";
import { CITIES } from "../ingestion/search-area";

// A dash or bracket part that only names a place or a work mode carries no role. Employment type stays, because one employer can paste one text onto a full-time and a part-time requisition.
const NOISE_WORDS = new Set([
  ...CITIES.flatMap((city) => city.split(" ")),
  "ontario",
  "on",
  "canada",
  "ca",
  "can",
  "gta",
  "greater",
  "area",
  "remote",
  "hybrid",
  "onsite",
  "site",
  "office",
  "wfh",
]);

const ABBREVIATIONS: Record<string, string> = {
  sr: "senior",
  jr: "junior",
  dev: "developer",
  eng: "engineer",
  swe: "software engineer",
};

const ROMAN: Record<string, string> = {
  i: "1",
  ii: "2",
  iii: "3",
  iv: "4",
  v: "5",
  vi: "6",
  vii: "7",
  viii: "8",
  ix: "9",
};

const REQUISITION_ID = /\b(?:jr|r|req|reqid|id|job)?[-_ #]?\d{5,}\b/g;

function tokens(text: string): string[] {
  return text.split(/[^a-z0-9]+/).filter(Boolean);
}

function isNoise(part: string): boolean {
  const found = tokens(part);
  return found.length > 0 && found.every((t) => NOISE_WORDS.has(t));
}

// Only noise parts go, because "Engineer - Payments" and "Engineer - Platform" are two roles.
export function normalizeTitle(title: string): string {
  let text = title
    .toLowerCase()
    .replace(REQUISITION_ID, " ")
    // Without these, C++, C# and C would all become "c".
    .replace(/c\+\+/g, "cpp")
    .replace(/\bc#/g, "csharp")
    .replace(/\bf#/g, "fsharp")
    .replace(/\.net\b/g, "dotnet")
    .replace(/&/g, " and ");
  text = text.replace(/\(([^)]*)\)|\[([^\]]*)\]/g, (_, round, square) => {
    const inside = round ?? square;
    return isNoise(inside) ? " " : ` ${inside} `;
  });
  const parts = text.split(/\s+[-–—|]\s+/);
  const kept = parts.filter((part, i) => i === 0 || !isNoise(part));
  return tokens(kept.join(" "))
    .map((t) => ABBREVIATIONS[t] ?? ROMAN[t] ?? t)
    .join(" ")
    .split(" ")
    .filter(Boolean)
    .join(" ");
}

export function titleSimilarity(a: string, b: string): number {
  const left = normalizeTitle(a);
  const right = normalizeTitle(b);
  return left === right ? 1 : similarity(left, right);
}
