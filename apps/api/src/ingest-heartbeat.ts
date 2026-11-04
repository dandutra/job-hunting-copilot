import { Injectable, OnApplicationBootstrap } from "@nestjs/common";
import { writeFileSync } from "node:fs";

export const INGEST_HEALTH_FILE = "/tmp/ingest-started";

@Injectable()
export class IngestHeartbeat implements OnApplicationBootstrap {
  file = process.env.INGEST_HEALTH_FILE ?? INGEST_HEALTH_FILE;

  onApplicationBootstrap() {
    // The Compose health check for `ingest` tests for this file, because it has no HTTP listener.
    writeFileSync(this.file, new Date().toISOString());
  }
}
