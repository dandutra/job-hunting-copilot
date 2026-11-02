import { Module } from "@nestjs/common";
import { IngestHeartbeat } from "./ingest-heartbeat";
import { MatchingModule } from "./matching/matching.module";

@Module({ imports: [MatchingModule], providers: [IngestHeartbeat] })
export class IngestModule {}
