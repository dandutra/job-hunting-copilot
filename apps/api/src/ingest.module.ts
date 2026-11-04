import { Module } from "@nestjs/common";
import { IngestHeartbeat } from "./ingest-heartbeat";
import { IngestionModule } from "./ingestion/ingestion.module";

@Module({ imports: [IngestionModule], providers: [IngestHeartbeat] })
export class IngestModule {}
