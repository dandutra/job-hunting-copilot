import {
  Injectable,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from "@nestjs/common";
import { writeFileSync } from "node:fs";

export const INGEST_HEALTH_FILE = "/tmp/ingest-started";

@Injectable()
export class IngestHeartbeat
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private timer?: NodeJS.Timeout;

  file = process.env.INGEST_HEALTH_FILE ?? INGEST_HEALTH_FILE;

  get running() {
    return this.timer !== undefined;
  }

  onApplicationBootstrap() {
    // The Compose health check for `ingest` tests for this file, because it has no HTTP listener.
    writeFileSync(this.file, new Date().toISOString());
    // Placeholder until the hourly scheduler exists: an application context alone exits at once.
    this.timer = setInterval(() => undefined, 60_000);
  }

  onModuleDestroy() {
    clearInterval(this.timer);
    this.timer = undefined;
  }
}
