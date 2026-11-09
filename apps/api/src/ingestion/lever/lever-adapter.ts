import {
  BoardAdapter,
  BoardRow,
  ParsedBoard,
  Raw,
  dateOrNull,
  str,
} from "../board-adapter";

// Boards on jobs.eu.lever.co live on api.eu.lever.co; the Watched company row has no region, so only the global API is read.
export class LeverAdapter extends BoardAdapter {
  protected readonly ats = "lever" as const;

  protected url(slug: string): string {
    return `https://api.lever.co/v0/postings/${encodeURIComponent(slug)}?mode=json`;
  }

  protected parseBody(json: unknown): ParsedBoard {
    return Array.isArray(json) ? { rows: json } : "body is not a postings list";
  }

  protected readRow(raw: unknown, slug: string): BoardRow | string {
    const job = raw as Raw | null;
    const id = str(job?.id);
    const title = str(job?.text);
    if (!id) return "id is missing";
    if (!title) return "title is missing";
    const all: unknown = job?.categories?.allLocations;
    const locations = (
      Array.isArray(all) && all.length > 0 ? all : [job?.categories?.location]
    )
      .map(str)
      .filter((l): l is string => l !== null);
    return {
      id,
      url: `https://jobs.lever.co/${slug}/${id}`,
      title,
      locations,
      description: str(job?.descriptionPlain) ?? "",
      postedAt: dateOrNull(job?.createdAt),
    };
  }
}
