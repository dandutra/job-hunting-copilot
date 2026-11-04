import createClient from "openapi-fetch";
import type { paths } from "./schema";

type Fetch = (request: Request) => Promise<Response>;

// nginx and the Vite dev proxy both strip /api before the request reaches the API.
export function createApiClient(
  fetchImpl: Fetch = (request) => fetch(request),
) {
  return createClient<paths>({
    baseUrl: `${location.origin}/api`,
    fetch: fetchImpl,
  });
}
