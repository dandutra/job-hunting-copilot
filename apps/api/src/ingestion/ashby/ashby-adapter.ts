import {
  BoardAdapter,
  BoardRow,
  ParsedBoard,
  Raw,
  dateOrNull,
  slugPath,
  withRemote,
  str,
} from "../board-adapter";

export class AshbyAdapter extends BoardAdapter {
  protected readonly ats = "ashby" as const;

  protected url(slug: string): string {
    return `https://api.ashbyhq.com/posting-api/job-board/${slugPath(slug)}`;
  }

  protected parseBody(json: unknown): ParsedBoard {
    const jobs = (json as { jobs?: unknown } | null)?.jobs;
    return Array.isArray(jobs) ? { rows: jobs } : "body has no jobs list";
  }

  protected readRow(raw: unknown, slug: string): BoardRow | null | string {
    const job = raw as Raw | null;
    if ((job?.isListed as unknown) === false) return null;
    const id = str(job?.id);
    const title = str(job?.title);
    if (!id) return "id is missing";
    if (!title) return "title is missing";
    const secondary: unknown[] = Array.isArray(job?.secondaryLocations)
      ? job.secondaryLocations
      : [];
    const locations = [
      job?.location,
      ...secondary.map((s) =>
        typeof s === "string"
          ? s
          : (s as { location?: unknown } | null)?.location,
      ),
    ]
      .map(str)
      .filter((l): l is string => l !== null);
    // isRemote is also true for hybrid roles, so workplaceType decides when Ashby sends it.
    const workplace = str(job?.workplaceType);
    const remote = workplace
      ? workplace.toLowerCase() === "remote"
      : (job?.isRemote as unknown) === true;
    return {
      id,
      url: str(job?.jobUrl) ?? `https://jobs.ashbyhq.com/${slug}/${id}`,
      title,
      locations: remote ? withRemote(locations) : locations,
      description: str(job?.descriptionPlain) ?? "",
      // publishedAt resets on a republish; the matcher keeps a Sighting's earliest date, so the Posting's age holds.
      postedAt: dateOrNull(job?.publishedAt),
    };
  }
}
