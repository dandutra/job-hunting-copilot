import { inGta, inSearchArea } from "../ingestion/search-area";

export type Metro = "gta" | "remote-canada" | "other";

export function metroOf(location: string): Metro {
  if (inGta(location)) return "gta";
  return inSearchArea([location]) ? "remote-canada" : "other";
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
