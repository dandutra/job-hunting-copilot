import { expect, it, vi } from "vitest";
import { createApiClient } from "./client";

it("returns the typed body of GET /health", async () => {
  const fetchMock = vi.fn(async (request: Request) => {
    expect(new URL(request.url).pathname).toBe("/api/health");
    return Response.json({ status: "ok" });
  });
  const client = createApiClient(fetchMock);

  const { data } = await client.GET("/health");

  // `status` is typed string; a DTO change breaks this line at typecheck.
  expect(data?.status).toBe("ok");
});
