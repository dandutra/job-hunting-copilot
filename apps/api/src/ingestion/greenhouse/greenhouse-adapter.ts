import {
  BoardAdapter,
  BoardRow,
  ParsedBoard,
  Raw,
  dateOrNull,
  slugPath,
  decodeEntities,
  htmlToText,
  str,
} from "../board-adapter";

export class GreenhouseAdapter extends BoardAdapter {
  protected readonly ats = "greenhouse" as const;

  protected url(slug: string): string {
    return `https://boards-api.greenhouse.io/v1/boards/${slugPath(slug)}/jobs?content=true`;
  }

  protected parseBody(json: unknown): ParsedBoard {
    const jobs = (json as { jobs?: unknown } | null)?.jobs;
    return Array.isArray(jobs) ? { rows: jobs } : "body has no jobs list";
  }

  protected readRow(raw: unknown, slug: string): BoardRow | string {
    const job = raw as Raw | null;
    const id = job?.id === undefined ? null : String(job.id);
    const title = str(job?.title);
    if (!id || !/^\d+$/.test(id)) return "id is missing";
    if (!title) return "title is missing";
    const location = str(job?.location?.name) ?? "";
    return {
      id,
      // absolute_url is sometimes the company's own careers page, so the board URL is built here.
      url: `https://boards.greenhouse.io/${slug}/jobs/${id}`,
      title,
      locations: location
        .split(";")
        .map((l) => l.trim())
        .filter(Boolean),
      // The API sends the HTML escaped, so one decode gives HTML and htmlToText strips it.
      description: htmlToText(decodeEntities(str(job?.content) ?? "")),
      postedAt: dateOrNull(job?.first_published),
    };
  }
}
