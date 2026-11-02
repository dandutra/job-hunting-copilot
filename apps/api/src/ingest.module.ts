import { Module } from "@nestjs/common";
import { MatchingModule } from "./matching/matching.module";

@Module({ imports: [MatchingModule] })
export class IngestModule {}
