import { Module } from "@nestjs/common";
import { AuthModule } from "./auth/auth.module";
import { MasterProfileModule } from "./master-profile/master-profile.module";
import { TailoringModule } from "./tailoring/tailoring.module";
import { HealthController } from "./health.controller";

@Module({
  imports: [AuthModule, MasterProfileModule, TailoringModule],
  controllers: [HealthController],
})
export class AppModule {}
