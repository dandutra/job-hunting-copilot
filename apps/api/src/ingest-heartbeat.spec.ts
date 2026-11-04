import { mkdtempSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Test } from "@nestjs/testing";
import { IngestHeartbeat } from "./ingest-heartbeat";

describe("IngestHeartbeat", () => {
  const dir = mkdtempSync(join(tmpdir(), "hb-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("touches the health file at bootstrap", () => {
    const file = join(dir, "started");
    const heartbeat = new IngestHeartbeat();
    heartbeat.file = file;
    expect(existsSync(file)).toBe(false);

    heartbeat.onApplicationBootstrap();
    expect(existsSync(file)).toBe(true);
  });

  it("fails loudly when the health file cannot be written", () => {
    const heartbeat = new IngestHeartbeat();
    heartbeat.file = join(dir, "missing-dir", "started");
    expect(() => heartbeat.onApplicationBootstrap()).toThrow();
  });

  it("can be built by the Nest container", async () => {
    const module = await Test.createTestingModule({
      providers: [IngestHeartbeat],
    }).compile();
    expect(module.get(IngestHeartbeat)).toBeInstanceOf(IngestHeartbeat);
  });
});
