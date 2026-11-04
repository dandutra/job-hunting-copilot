import { Module } from "@nestjs/common";
import { MatchingModule } from "../matching/matching.module";
import { PrismaModule } from "../prisma/prisma.module";
import { AlertHook, LogAlertHook } from "./alert-hook";
import {
  IngestOptions,
  IngestScheduler,
  INGEST_OPTIONS,
} from "./ingest-scheduler";
import { JOB_SOURCE_ADAPTERS, JobSourceAdapter } from "./job-source-adapter";
import { JobspyAdapter } from "./jobspy/jobspy-adapter";
import { LogPollHooks, PollHooks } from "./poll-hooks";

const JOBSPY_SITES = ["linkedin", "indeed"] as const;

@Module({
  imports: [PrismaModule, MatchingModule],
  providers: [
    IngestScheduler,
    { provide: AlertHook, useClass: LogAlertHook },
    { provide: PollHooks, useClass: LogPollHooks },
    {
      provide: INGEST_OPTIONS,
      useFactory: (): IngestOptions => ({
        lockUrl: process.env.DATABASE_URL ?? "",
      }),
    },
    {
      provide: JOB_SOURCE_ADAPTERS,
      inject: [AlertHook],
      useFactory: (alerts: AlertHook): JobSourceAdapter[] =>
        JOBSPY_SITES.map(
          (site) =>
            new JobspyAdapter(
              {
                baseUrl: process.env.JOBSPY_URL ?? "http://localhost:8000",
                site,
                searchTerm:
                  process.env.JOBSPY_SEARCH_TERM ?? "software developer",
                location: process.env.JOBSPY_LOCATION ?? "Canada",
                resultsWanted: Number(process.env.JOBSPY_RESULTS_WANTED ?? 50),
                // The ingest container gets 6 minutes to stop, and a poll in progress finishes first.
                timeoutMs: 5 * 60 * 1000,
              },
              alerts,
            ),
        ),
    },
  ],
})
export class IngestionModule {}
