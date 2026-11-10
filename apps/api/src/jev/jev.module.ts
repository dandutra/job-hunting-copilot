import { Logger, Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { JevClient, jevConfigFromEnv, TypeSafeJevClient } from "./jev-client";
import { JevRunner } from "./jev-runner";

@Module({
  imports: [PrismaModule],
  providers: [
    JevRunner,
    {
      provide: JevClient,
      useFactory: (): JevClient | null => {
        const config = jevConfigFromEnv();
        if (!config) {
          new Logger("Jev").warn(
            "TYPESAFE_API_KEY is empty; no Posting will be judged",
          );
          return null;
        }
        return new TypeSafeJevClient(config);
      },
    },
  ],
  exports: [JevRunner],
})
export class JevModule {}
