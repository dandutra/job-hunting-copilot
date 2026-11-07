import { existsSync, readFileSync } from "node:fs";

export interface ImportOutcome {
  ok: boolean;
  output: string;
}

interface ImportReply {
  version: string;
  created: boolean;
  read: number;
  added: number;
  retired: number;
}

export interface ImportOptions {
  path: string;
  apiUrl: string | undefined;
  fetchFn?: typeof fetch;
}

export async function importProfile(
  options: ImportOptions,
): Promise<ImportOutcome> {
  const { path, apiUrl, fetchFn = fetch } = options;
  const fail = (output: string): ImportOutcome => ({ ok: false, output });
  if (!apiUrl) return fail("COPILOT_API_URL is not set; see .env.example");
  if (!existsSync(path)) return fail(`File not found: ${path}`);

  const base = apiUrl.replace(/\/+$/, "");
  let res: Response;
  try {
    res = await fetchFn(`${base}/master-profile`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ yaml: readFileSync(path, "utf8") }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError")
      return fail(
        `${base} did not answer within 30 seconds; it may have stored the version, and re-running is safe`,
      );
    return fail(`Could not reach ${base}; is Tailscale up?`);
  }

  if (res.status === 400) {
    const body = (await res.json().catch(() => ({}))) as {
      errors?: { id: string; message: string }[];
      message?: unknown;
    };
    const lines = body.errors
      ? body.errors.map((e) => `  ${e.id}: ${e.message}`)
      : [`  ${String(body.message ?? "no reason given")}`];
    return fail([`${path} was rejected:`, ...lines].join("\n"));
  }
  // Serve and nginx route only /api/ to the API; anything else is the static UI.
  if (res.status === 404 || res.status === 405)
    return fail(
      `${base} answered ${res.status}; nothing stored. Check that COPILOT_API_URL ends in /api and the API is current.`,
    );
  if (res.status === 401)
    return fail(
      `${base} answered 401; nothing stored. Either the request missed Tailscale Serve, which adds the login header, or this Mac's Tailscale login is not ALLOWED_TAILSCALE_LOGIN. The API log names the rejected login.`,
    );
  if (!res.ok) return fail(`The API answered ${res.status}; nothing stored`);

  let body: ImportReply;
  try {
    body = (await res.json()) as ImportReply;
  } catch {
    return fail(
      `${base} answered 200 but not JSON; is COPILOT_API_URL the API?`,
    );
  }
  if (body.read === 0) return fail(`${path} has 0 Entries`);
  const counts = `${body.read} Entries read, ${body.added} added, ${body.retired} retired`;
  return {
    ok: true,
    output: body.created
      ? `Imported version ${body.version}: ${counts}`
      : `Version ${body.version} was already stored: ${counts}`,
  };
}
