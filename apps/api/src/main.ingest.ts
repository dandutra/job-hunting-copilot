import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { IngestModule } from "./ingest.module";

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(IngestModule);
  app.enableShutdownHooks();
}
void bootstrap();
