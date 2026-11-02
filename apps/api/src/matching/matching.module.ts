import { Module } from "@nestjs/common";
import { CompaniesModule } from "../companies/companies.module";
import { PrismaModule } from "../prisma/prisma.module";
import { MatchingHooks, NoopMatchingHooks } from "./matching-hooks";
import { SightingMatcher } from "./sighting-matcher";

@Module({
  imports: [PrismaModule, CompaniesModule],
  providers: [
    SightingMatcher,
    { provide: MatchingHooks, useClass: NoopMatchingHooks },
  ],
  exports: [SightingMatcher],
})
export class MatchingModule {}
