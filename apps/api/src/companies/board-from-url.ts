import { parseListingKey } from "../matching/listing-key";
import { workdaySlug } from "./seed";

export interface Board {
  ats: string;
  boardSlug: string;
}

// The adapters read only the global APIs, so a board on an EU host would fail every poll.
const EU_HOSTS = new Set([
  "jobs.eu.lever.co",
  "boards.eu.greenhouse.io",
  "job-boards.eu.greenhouse.io",
]);

// Two slugs with one key read the same jobs: listing keys lowercase the slug, and a Workday key names the tenant but not the site.
export function boardKey(board: Board): string {
  let slug = board.boardSlug;
  try {
    slug = decodeURIComponent(slug);
  } catch {
    // A stray "%" is part of the slug.
  }
  slug = slug.toLowerCase();
  return board.ats === "workday"
    ? `workday:${slug.split(".")[0]}`
    : `${board.ats}:${slug}`;
}

// The slug stays as it stands in the URL, the way the seed stores it: the adapters decode it for the API call and lowercase it only in the listing key.
export function boardFromUrl(rawUrl: string): Board | null {
  // A URL that is not a job listing on a supported ATS names no board.
  const key = parseListingKey(rawUrl);
  if (!key) return null;
  const ats = key.split(":")[0];
  const url = new URL(rawUrl);
  if (EU_HOSTS.has(url.hostname.toLowerCase())) return null;

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
