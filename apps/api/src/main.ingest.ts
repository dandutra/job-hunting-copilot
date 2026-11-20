import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { IngestModule } from "./ingest.module";
import { getTitleFilter } from "./jev/title-filter";

async function bootstrap() {
  // A missing or bad title filter must stop ingest here, not let every title through on the first poll.
  getTitleFilter();
  const app = await NestFactory.createApplicationContext(IngestModule);
  app.enableShutdownHooks();
}
void bootstrap();
