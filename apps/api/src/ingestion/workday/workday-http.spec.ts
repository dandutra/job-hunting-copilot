import { createServer, IncomingMessage, Server } from "node:http";
import { AddressInfo } from "node:net";
import { createWorkdayHttp } from "./workday-http";

interface Seen {
  method?: string;
  url?: string;
  headers: IncomingMessage["headers"];
  body: string;
}

describe("createWorkdayHttp", () => {
  let server: Server;
  let base: string;
  let seen: Seen;
  let reply: (res: import("node:http").ServerResponse) => void;

  beforeEach(async () => {
    seen = { headers: {}, body: "" };
    reply = (res) => res.end("{}");
    server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => {
        seen = {
          method: req.method,
          url: req.url,
          headers: req.headers,
          body: Buffer.concat(chunks).toString("utf8"),
        };
        reply(res);
      });
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });

  it.each([200, 429, 403])(
    "a POST sends the method, headers and body unchanged and returns status %i",
    async (status) => {
      reply = (res) => {
        res.statusCode = status;
        res.end(`{"status":${status}}`);
      };
      const body = JSON.stringify({
        appliedFacets: {},
        limit: 20,
        offset: 0,
        searchText: "é",
      });

      const res = await createWorkdayHttp().post(
        `${base}/wday/cxs/t/s/jobs`,
        body,
        {
          "user-agent": "job-hunting-copilot/1.0",
          accept: "application/json",
          "content-type": "application/json",
        },
      );

      expect(res).toEqual({ status, body: `{"status":${status}}` });
      expect(seen.method).toBe("POST");
      expect(seen.url).toBe("/wday/cxs/t/s/jobs");
      expect(seen.headers["user-agent"]).toBe("job-hunting-copilot/1.0");
      expect(seen.headers.accept).toBe("application/json");
      expect(seen.headers["content-type"]).toBe("application/json");
      expect(seen.body).toBe(body);
    },
  );

  it("a GET sends the method and headers and returns the status and body", async () => {
    reply = (res) => {
      res.statusCode = 403;
      res.end('{"errorCode":"S22"}');
    };

    const res = await createWorkdayHttp().get(`${base}/wday/cxs/t/s/job/1`, {
      "user-agent": "job-hunting-copilot/1.0",
      accept: "application/json",
    });

    expect(res).toEqual({ status: 403, body: '{"errorCode":"S22"}' });
    expect(seen.method).toBe("GET");
    expect(seen.url).toBe("/wday/cxs/t/s/job/1");
    expect(seen.headers["user-agent"]).toBe("job-hunting-copilot/1.0");
    expect(seen.body).toBe("");
  });

  it("reads a multi-byte body split across chunks as UTF-8", async () => {
    const bytes = Buffer.from("Montréal – Québec");
    reply = (res) => {
      res.write(bytes.subarray(0, 8));
      setTimeout(() => res.end(bytes.subarray(8)), 20);
    };

    const res = await createWorkdayHttp().get(`${base}/x`, {});

    expect(res.body).toBe("Montréal – Québec");
  });

  it("rejects after the timeout when the server never answers", async () => {
    reply = () => undefined;

    await expect(createWorkdayHttp(50).get(`${base}/x`, {})).rejects.toThrow();
  });

  it("rejects after the timeout when the body never finishes", async () => {
    reply = (res) => {
      res.write("{");
    };

    await expect(
      createWorkdayHttp(50).post(`${base}/x`, "{}", {}),
    ).rejects.toThrow();
  });
});
