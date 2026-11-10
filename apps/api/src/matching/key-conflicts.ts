import { Sighting } from "@prisma/client";
import { boardOf } from "./listing-key";

export function keysOf(sightings: Sighting[]): string[] {
  return sightings.flatMap((s) =>
    s.directKey ? [s.listingKey, s.directKey] : [s.listingKey],
  );
}

// Two different keys on one board are two listings, so they never share a Posting.
export function conflicts(a: string[], b: string[]): boolean {
  return a.some((x) => b.some((y) => x !== y && boardOf(x) === boardOf(y)));
}
