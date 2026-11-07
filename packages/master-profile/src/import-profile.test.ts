import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { importProfile } from "./import-profile";

function fileWith(text: string): string {
  const path = join(mkdtempSync(join(tmpdir(), "profile-")), "p.yaml");
  writeFileSync(path, text);
  return path;
}

const reply = (status: number, body: unknown) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status }));

describe("importProfile", () => {
  it("sends the raw file text and reports read, added and retired", async () => {
    const fetchFn = reply(200, {
      version: "abc",
      created: true,
      read: 9,
      added: 3,
      retired: 1,
    });
    const result = await importProfile({
      path: fileWith("a: 1\n"),
      apiUrl: "http://api.test/",
      fetchFn,
    });

    expect(result).toEqual({
      ok: true,
      output: "Imported version abc: 9 Entries read, 3 added, 1 retired",
    });
    const [url, init] = fetchFn.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("http://api.test/master-profile");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body as string)).toEqual({ yaml: "a: 1\n" });
  });

  it("says when the version was already stored", async () => {
    const result = await importProfile({
      path: fileWith("a: 1\n"),
      apiUrl: "http://api.test",
      fetchFn: reply(200, {
        version: "abc",
        created: false,
        read: 9,
        added: 0,
        retired: 0,
      }),
    });
    expect(result.ok).toBe(true);
    expect(result.output).toContain("already stored");
  });

  it("fails and lists every error when the API rejects the file", async () => {
    const result = await importProfile({
      path: fileWith("a: 1\n"),
      apiUrl: "http://api.test",
      fetchFn: reply(400, {
        errors: [
          { id: "F2", message: "F2 is missing" },
          { id: "F9", message: "bad tag" },
        ],
      }),
    });
    expect(result.ok).toBe(false);
    expect(result.output).toContain("F2: F2 is missing");
    expect(result.output).toContain("F9: bad tag");
  });

  it("fails on 0 Entries read", async () => {
    const result = await importProfile({
      path: fileWith("a: 1\n"),
      apiUrl: "http://api.test",
      fetchFn: reply(200, {
        version: "abc",
        created: true,
        read: 0,
        added: 0,
        retired: 0,
      }),
    });
    expect(result.ok).toBe(false);
    expect(result.output).toContain("0 Entries");
  });

  it("fails on a missing file without calling the API", async () => {
    const fetchFn = reply(200, {});
    const result = await importProfile({
      path: "/nonexistent/p.yaml",
      apiUrl: "http://api.test",
      fetchFn,
    });
    expect(result.ok).toBe(false);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("fails on a missing API URL without calling the API", async () => {
    const fetchFn = reply(200, {});
    const result = await importProfile({
      path: fileWith("a: 1\n"),
      apiUrl: undefined,
      fetchFn,
    });
    expect(result.ok).toBe(false);
    expect(result.output).toContain("COPILOT_API_URL");
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("fails clearly on 401 and on an unreachable API", async () => {
    const unauthorized = await importProfile({
      path: fileWith("a: 1\n"),
      apiUrl: "http://api.test",
      fetchFn: reply(401, { message: "Unauthorized" }),
    });
    expect(unauthorized.ok).toBe(false);
    expect(unauthorized.output).toContain("401");

    const down = await importProfile({
      path: fileWith("a: 1\n"),
      apiUrl: "http://api.test",
      fetchFn: vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    });
    expect(down.ok).toBe(false);
    expect(down.output).toContain("http://api.test");
  });
});
