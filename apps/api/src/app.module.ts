import { Module } from "@nestjs/common";
import { AuthModule } from "./auth/auth.module";
import { MasterProfileModule } from "./master-profile/master-profile.module";
import { MergeReviewModule } from "./matching/merge-review.module";
import { TailoringModule } from "./tailoring/tailoring.module";
import { HealthController } from "./health.controller";

@Module({
  imports: [
    AuthModule,
    MasterProfileModule,
    TailoringModule,
    MergeReviewModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
