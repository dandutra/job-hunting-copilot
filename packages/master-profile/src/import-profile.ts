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
    });
  } catch {
    return fail(`Could not reach ${base}; is Tailscale up?`);
  }

  if (res.status === 400) {
    const body = (await res.json().catch(() => ({}))) as {
      errors?: { id: string; message: string }[];
    };
    const lines = (body.errors ?? []).map((e) => `  ${e.id}: ${e.message}`);
    return fail([`${path} was rejected:`, ...lines].join("\n"));
  }
  if (!res.ok) return fail(`The API answered ${res.status}; nothing stored`);

  const body = (await res.json()) as ImportReply;
  if (body.read === 0) return fail(`${path} has 0 Entries`);
  const counts = `${body.read} Entries read, ${body.added} added, ${body.retired} retired`;
  return {
    ok: true,
    output: body.created
      ? `Imported version ${body.version}: ${counts}`
      : `Version ${body.version} was already stored: ${counts}`,
  };
}
