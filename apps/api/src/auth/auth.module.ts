import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { MeController } from "./me.controller";
import { ALLOWED_LOGIN, TailnetGuard } from "./tailnet.guard";

@Module({
  controllers: [MeController],
  providers: [
    {
      provide: ALLOWED_LOGIN,
      useFactory: (): string => {
        const login = process.env.ALLOWED_TAILSCALE_LOGIN?.trim();
        if (!login) {
          throw new Error(
            "ALLOWED_TAILSCALE_LOGIN is empty; the API refuses to start without it",
          );
        }
        return login;
      },
    },
    { provide: APP_GUARD, useClass: TailnetGuard },
  ],
})
export class AuthModule {}
