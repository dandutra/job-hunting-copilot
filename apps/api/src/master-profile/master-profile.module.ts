import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { MasterProfileController } from "./master-profile.controller";
import { MasterProfileService } from "./master-profile.service";

@Module({
  imports: [PrismaModule],
  controllers: [MasterProfileController],
  providers: [MasterProfileService],
})
export class MasterProfileModule {}
