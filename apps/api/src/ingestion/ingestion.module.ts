import { Module } from "@nestjs/common";
import {
  FileTierConfigSource,
  TierConfigSource,
} from "../feed/tier-config-source";
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
import { SmartRecruitersAdapter } from "./smartrecruiters/smartrecruiters-adapter";
import { WorkdayAdapter } from "./workday/workday-adapter";
import {
  JobspyAdapter,
  jobspyConfigFromEnv,
  JobspyPlace,
} from "./jobspy/jobspy-adapter";
import { HeartbeatPollHooks } from "./heartbeat-poll-hooks";
import { JevPollHooks } from "./jev-poll-hooks";
import { PollHooks } from "./poll-hooks";

const JOBSPY_SITES = ["linkedin", "indeed"] as const;
// Toronto first, then the other places, each one request. The scheduler polls adapters one after another, and the sites alternate, so two LinkedIn requests never run back to back.
const JOBSPY_PLACES: (JobspyPlace | undefined)[] = [
  undefined,
  "london",
  "halifax",
];

@Module({
  imports: [PrismaModule, MatchingModule, JevModule],
  providers: [
    IngestScheduler,
    { provide: AlertHook, useClass: LogAlertHook },
    { provide: TierConfigSource, useClass: FileTierConfigSource },
    {
      provide: PollHooks,
      inject: [JevRunner, TierConfigSource, PrismaService],
      useFactory: (
        jev: JevRunner,
        tierConfig: TierConfigSource,
        prisma: PrismaService,
      ) =>
        new JevPollHooks(
          new HeartbeatPollHooks(process.env.HEARTBEAT_URL ?? ""),
          jev,
          tierConfig,
          prisma,
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
        ...JOBSPY_PLACES.flatMap((place) =>
          JOBSPY_SITES.map(
            (site) =>
              new JobspyAdapter(
                jobspyConfigFromEnv(site, process.env, undefined, place),
                alerts,
              ),
          ),
        ),
        new GreenhouseAdapter(prisma),
        new LeverAdapter(prisma),
        new AshbyAdapter(prisma),
        new SmartRecruitersAdapter(prisma),
        new WorkdayAdapter(prisma),
      ],
    },
  ],
})
export class IngestionModule {}
