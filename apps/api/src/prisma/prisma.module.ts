import { Module } from "@nestjs/common";
import { PrismaService } from "./prisma.service";

@Module({
  providers: [
    { provide: PrismaService, useFactory: () => new PrismaService() },
  ],
  exports: [PrismaService],
})
export class PrismaModule {}
