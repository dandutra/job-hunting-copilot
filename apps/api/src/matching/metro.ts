import {
  inGta,
  inHalifax,
  inLondonOn,
  inSearchArea,
} from "../ingestion/search-area";

export type Metro = "gta" | "london-on" | "halifax" | "remote-canada" | "other";

// Board adapters store several places joined with "; ". Each entry is judged alone, as the adapters judged it, so "London, UK; Ottawa, ON" never pairs London with Ontario.
export function metroOf(location: string): Metro {
  const entries = location.split(/;\s*/);
  if (entries.some(inGta)) return "gta";
  if (entries.some(inLondonOn)) return "london-on";
  if (entries.some(inHalifax)) return "halifax";
  return inSearchArea(entries) ? "remote-canada" : "other";
}

function squash(location: string): string {
  return location
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Two places outside the area are one metro only when their text is equal, so Calgary never joins Vancouver.
export function sameMetro(a: string, b: string): boolean {
  const left = metroOf(a);
  if (left !== metroOf(b)) return false;
  return left !== "other" || squash(a) === squash(b);
}
