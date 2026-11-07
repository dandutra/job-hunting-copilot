import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { TailoringController } from "./tailoring.controller";
import { TailoringService } from "./tailoring.service";

@Module({
  imports: [PrismaModule],
  controllers: [TailoringController],
  providers: [TailoringService],
})
export class TailoringModule {}
