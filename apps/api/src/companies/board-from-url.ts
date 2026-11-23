import { parseListingKey } from "../matching/listing-key";
import { workdaySlug } from "./seed";

export interface Board {
  ats: string;
  boardSlug: string;
}

// The slug stays as it stands in the URL, the way the seed stores it: the adapters decode it for the API call and lowercase it only in the listing key.
export function boardFromUrl(rawUrl: string): Board | null {
  // A URL that is not a job listing on a supported ATS names no board.
  const key = parseListingKey(rawUrl);
  if (!key) return null;
  const ats = key.split(":")[0];
  const url = new URL(rawUrl);

  if (ats === "workday") {
    const boardSlug = workdaySlug(rawUrl);
    return boardSlug ? { ats, boardSlug } : null;
  }
  // The Greenhouse embed form names its board in a query parameter.
  const embedded = url.pathname.startsWith("/embed/")
    ? url.searchParams.get("for")
    : null;
  const boardSlug = embedded ?? url.pathname.split("/").filter(Boolean)[0];
  return boardSlug ? { ats, boardSlug } : null;
}
