const ATS_SOURCES = new Set([
  "greenhouse",
  "lever",
  "ashby",
  "smartrecruiters",
  "workday",
]);
const GREENHOUSE_HOSTS = new Set([
  "boards.greenhouse.io",
  "job-boards.greenhouse.io",
  "boards.eu.greenhouse.io",
  "job-boards.eu.greenhouse.io",
]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const WORKDAY_HOST = /^([a-z0-9-]+)\.wd\d+\.myworkdayjobs\.com$/;

// A false merge costs more than a split, so only a small suffix after a non-year id is stripped. See the exact-key gotcha.
function stripWorkdaySiteSuffix(requisition: string): string {
  const match = /^(.*\d.*)-[1-9]\d?$/.exec(requisition);
  if (!match || /(^|-)(19|20)\d{2}(-|$)/.test(match[1])) return requisition;
  return match[1];
}

export function normalizeListingKey(key: string): string {
  const lower = key.trim().toLowerCase();
  const [source, tenant, ...rest] = lower.split(":");
  if (source !== "workday" || !tenant || rest.length === 0) return lower;
  return `workday:${tenant}:${stripWorkdaySiteSuffix(rest.join(":"))}`;
}

// Two keys on one board are different listings and never merge.
export function boardOf(key: string): string {
  const parts = key.split(":");
  return ATS_SOURCES.has(parts[0]) ? parts.slice(0, 2).join(":") : parts[0];
}

function greenhouseKey(url: URL, segments: string[]): string | null {
  if (segments[0] === "embed" && segments[1] === "job_app") {
    const board = url.searchParams.get("for");
    const id = url.searchParams.get("token");
    return board && id && /^\d+$/.test(id) ? `greenhouse:${board}:${id}` : null;
  }
  const [board, jobs, id] = segments;
  return board && jobs === "jobs" && /^\d+$/.test(id ?? "")
    ? `greenhouse:${board}:${id}`
    : null;
}

function workdayKey(tenant: string, segments: string[]): string | null {
  const start = segments.findIndex((s) => s === "job" || s === "details");
  if (start < 0) return null;
  const rest = segments.slice(start + 1);
  if (rest[rest.length - 1] === "apply") rest.pop();
  const slug = rest[rest.length - 1] ?? "";
  const requisition = slug.slice(slug.lastIndexOf("_") + 1);
  return slug.includes("_") && requisition
    ? `workday:${tenant}:${stripWorkdaySiteSuffix(requisition)}`
    : null;
}

export function parseListingKey(rawUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;

  const host = url.hostname.toLowerCase();
  const segments = url.pathname.split("/").filter(Boolean);
  let key: string | null;

  if (GREENHOUSE_HOSTS.has(host)) {
    key = greenhouseKey(url, segments);
  } else if (host === "jobs.lever.co" || host === "jobs.eu.lever.co") {
    key = UUID.test(segments[1] ?? "")
      ? `lever:${segments[0]}:${segments[1]}`
      : null;
  } else if (host === "jobs.ashbyhq.com") {
    key = UUID.test(segments[1] ?? "")
      ? `ashby:${segments[0]}:${segments[1]}`
      : null;
  } else if (
    host === "jobs.smartrecruiters.com" ||
    host === "careers.smartrecruiters.com"
  ) {
    const id = /^\d+/.exec(segments[1] ?? "")?.[0];
    key =
      id && segments[0] !== "oneclick-ui"
        ? `smartrecruiters:${segments[0]}:${id}`
        : null;
  } else {
    const tenant = WORKDAY_HOST.exec(host)?.[1];
    key = tenant ? workdayKey(tenant, segments) : null;
  }
  return key ? key.toLowerCase() : null;
}
