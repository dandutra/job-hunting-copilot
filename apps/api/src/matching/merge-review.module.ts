import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { MergeReviewController } from "./merge-review.controller";
import { MergeReviewService } from "./merge-review.service";

@Module({
  imports: [PrismaModule],
  controllers: [MergeReviewController],
  providers: [MergeReviewService],
})
export class MergeReviewModule {}
