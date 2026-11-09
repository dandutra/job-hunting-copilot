import {
  BoardAdapter,
  BoardRow,
  ParsedBoard,
  Raw,
  dateOrNull,
  str,
} from "../board-adapter";

export class AshbyAdapter extends BoardAdapter {
  protected readonly ats = "ashby" as const;

  protected url(slug: string): string {
    return `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(slug)}`;
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
    // isRemote is also true for some hybrid roles, so it only adds "Remote", and the place still has to be in the area.
    if ((job?.isRemote as unknown) === true) {
      locations.push(
        ...(locations.length
          ? locations.map((l) => `Remote, ${l}`)
          : ["Remote"]),
      );
    }
    return {
      id,
      url: str(job?.jobUrl) ?? `https://jobs.ashbyhq.com/${slug}/${id}`,
      title,
      locations,
      description: str(job?.descriptionPlain) ?? "",
      // publishedAt resets when a job is republished, so it can move a Posting's age forward.
      postedAt: dateOrNull(job?.publishedAt),
    };
  }
}
