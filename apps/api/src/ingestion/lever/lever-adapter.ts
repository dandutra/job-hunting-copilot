import {
  BoardAdapter,
  BoardRow,
  ParsedBoard,
  Raw,
  dateOrNull,
  htmlToText,
  withRemote,
  slugPath,
  str,
} from "../board-adapter";

// Boards on jobs.eu.lever.co live on api.eu.lever.co; the Watched company row has no region, so only the global API is read.
export class LeverAdapter extends BoardAdapter {
  protected readonly ats = "lever" as const;

  protected url(slug: string): string {
    return `https://api.lever.co/v0/postings/${slugPath(slug)}?mode=json`;
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
    const listed = (
      Array.isArray(all) && all.length > 0 ? all : [job?.categories?.location]
    )
      .map(str)
      .filter((l): l is string => l !== null);
    // Some rows list no place but carry a country code; "CA" alone would read as California.
    const country = str(job?.country);
    const places = listed.length
      ? listed
      : country
        ? [country.toUpperCase() === "CA" ? "Canada" : country]
        : [];
    const remote = str(job?.workplaceType)?.toLowerCase() === "remote";
    return {
      id,
      url: `https://jobs.lever.co/${slug}/${id}`,
      title,
      locations: remote ? withRemote(places) : places,
      description: leverDescription(job),
      postedAt: dateOrNull(job?.createdAt),
    };
  }
}

// descriptionPlain is only the intro; the duties and requirements are in lists, and the closing text in additionalPlain.
function leverDescription(job: Raw | null): string {
  const lists: unknown[] = Array.isArray(job?.lists) ? job.lists : [];
  return [
    str(job?.descriptionPlain),
    ...lists.map((l) => {
      const list = l as Raw | null;
      return [str(list?.text), htmlToText(str(list?.content) ?? "")]
        .filter(Boolean)
        .join("\n");
    }),
    str(job?.additionalPlain),
  ]
    .filter(Boolean)
    .join("\n\n");
}
