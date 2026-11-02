import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { CompaniesService } from "./companies.service";

@Module({
  imports: [PrismaModule],
  providers: [CompaniesService],
  exports: [CompaniesService],
})
export class CompaniesModule {}
