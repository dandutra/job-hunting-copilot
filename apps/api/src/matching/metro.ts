import {
  inGta,
  inHalifax,
  inLondonOn,
  inRemoteCanada,
} from "../ingestion/search-area";

export type Metro = "gta" | "london-on" | "halifax" | "remote-canada" | "other";

// The metros a Posting can show under, in the order `metroOf` prefers them.
export const AREA_METROS = [
  "gta",
  "london-on",
  "halifax",
  "remote-canada",
] as const satisfies readonly Metro[];

export type AreaMetro = (typeof AREA_METROS)[number];

// Board adapters store several places joined with "; ". Each entry is judged alone, as the adapters judged it, so "London, UK; Ottawa, ON" never pairs London with Ontario.
export function metrosOf(location: string): AreaMetro[] {
  const entries = location.split(/;\s*/);
  const found = {
    gta: entries.some(inGta),
    "london-on": entries.some(inLondonOn),
    halifax: entries.some(inHalifax),
    "remote-canada": entries.some(inRemoteCanada),
  };
  return AREA_METROS.filter((metro) => found[metro]);
}

// The merge rule needs one metro per location, so it takes the first of the filter's metros.
export function metroOf(location: string): Metro {
  return metrosOf(location)[0] ?? "other";
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
