import http from "node:http";
import https from "node:https";
import type { WorkdayHttp } from "./workday-adapter";

export const REQUEST_TIMEOUT_MS = 30_000;

// Cloudflare answers Node's `fetch` (undici) with 429 on Workday's list call and answers `node:https` with
// 200 for the same request, so Workday is read through `node:https`. See the Workday career-site API concept.
export function createWorkdayHttp(timeoutMs = REQUEST_TIMEOUT_MS): WorkdayHttp {
  const send = (
    method: "GET" | "POST",
    url: string,
    body: string | undefined,
    headers: Record<string, string>,
  ) =>
    new Promise<{ status: number; body: string }>((resolve, reject) => {
      // A local test server speaks plain HTTP; Workday is always https.
      const transport = url.startsWith("http:") ? http : https;
      const sent =
        body === undefined
          ? headers
          : { ...headers, "content-length": String(Buffer.byteLength(body)) };
      // The signal bounds the whole exchange, body included, as `AbortSignal.timeout` did for `fetch`.
      const req = transport.request(url, {
        method,
        headers: sent,
        signal: AbortSignal.timeout(timeoutMs),
      });
      req.on("error", reject);
      req.on("response", (res) => {
        res.setEncoding("utf8");
        let text = "";
        res.on("data", (chunk: string) => (text += chunk));
        res.on("end", () =>
          resolve({ status: res.statusCode ?? 0, body: text }),
        );
        res.on("error", reject);
      });
      req.end(body);
    });

  return {
    get: (url, headers) => send("GET", url, undefined, headers),
    post: (url, body, headers) => send("POST", url, body, headers),
  };
}

export const workdayHttp: WorkdayHttp = createWorkdayHttp();
