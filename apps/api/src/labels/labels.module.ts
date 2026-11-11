import { Module } from "@nestjs/common";
import { AlertHook, LogAlertHook } from "../ingestion/alert-hook";
import { PrismaModule } from "../prisma/prisma.module";
import { FeedCorrectionService } from "./feed-correction.service";
import { LabelQueueService } from "./label-queue.service";
import { LabelsController } from "./labels.controller";
import { Clock, MathRandom, Random, SystemClock } from "./labels-env";

@Module({
  imports: [PrismaModule],
  controllers: [LabelsController],
  providers: [
    LabelQueueService,
    FeedCorrectionService,
    { provide: Clock, useClass: SystemClock },
    { provide: Random, useClass: MathRandom },
    { provide: AlertHook, useClass: LogAlertHook },
  ],
})
export class LabelsModule {}
