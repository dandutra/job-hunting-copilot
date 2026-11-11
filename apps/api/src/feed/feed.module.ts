import { Module } from "@nestjs/common";
import { Clock, SystemClock } from "../labels/labels-env";
import { PrismaModule } from "../prisma/prisma.module";
import { FeedController } from "./feed.controller";
import { FeedService } from "./feed.service";
import { FileTierConfigSource, TierConfigSource } from "./tier-config-source";

@Module({
  imports: [PrismaModule],
  controllers: [FeedController],
  providers: [
    FeedService,
    { provide: Clock, useClass: SystemClock },
    { provide: TierConfigSource, useClass: FileTierConfigSource },
  ],
})
export class FeedModule {}
