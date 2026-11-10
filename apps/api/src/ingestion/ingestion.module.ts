import { Module } from "@nestjs/common";
import { JevModule } from "../jev/jev.module";
import { JevRunner } from "../jev/jev-runner";
import { MatchingModule } from "../matching/matching.module";
import { PrismaService } from "../prisma/prisma.service";
import { PrismaModule } from "../prisma/prisma.module";
import { AlertHook, LogAlertHook } from "./alert-hook";
import {
  IngestOptions,
  IngestScheduler,
  INGEST_OPTIONS,
} from "./ingest-scheduler";
import { JOB_SOURCE_ADAPTERS, JobSourceAdapter } from "./job-source-adapter";
import { AshbyAdapter } from "./ashby/ashby-adapter";
import { GreenhouseAdapter } from "./greenhouse/greenhouse-adapter";
import { LeverAdapter } from "./lever/lever-adapter";
import { WorkdayAdapter } from "./workday/workday-adapter";
import { JobspyAdapter, jobspyConfigFromEnv } from "./jobspy/jobspy-adapter";
import { HeartbeatPollHooks } from "./heartbeat-poll-hooks";
import { JevPollHooks } from "./jev-poll-hooks";
import { PollHooks } from "./poll-hooks";

const JOBSPY_SITES = ["linkedin", "indeed"] as const;

@Module({
  imports: [PrismaModule, MatchingModule, JevModule],
  providers: [
    IngestScheduler,
    { provide: AlertHook, useClass: LogAlertHook },
    {
      provide: PollHooks,
      inject: [JevRunner],
      useFactory: (jev: JevRunner) =>
        new JevPollHooks(
          new HeartbeatPollHooks(process.env.HEARTBEAT_URL ?? ""),
          jev,
        ),
    },
    {
      provide: INGEST_OPTIONS,
      useFactory: (): IngestOptions => ({
        lockUrl: process.env.DATABASE_URL ?? "",
      }),
    },
    {
      provide: JOB_SOURCE_ADAPTERS,
      inject: [AlertHook, PrismaService],
      useFactory: (
        alerts: AlertHook,
        prisma: PrismaService,
      ): JobSourceAdapter[] => [
        ...JOBSPY_SITES.map(
          (site) => new JobspyAdapter(jobspyConfigFromEnv(site), alerts),
        ),
        new GreenhouseAdapter(prisma),
        new LeverAdapter(prisma),
        new AshbyAdapter(prisma),
        new WorkdayAdapter(prisma),
      ],
    },
  ],
})
export class IngestionModule {}
