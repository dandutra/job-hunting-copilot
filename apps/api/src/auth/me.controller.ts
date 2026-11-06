import { Controller, Get, Inject } from "@nestjs/common";
import { ApiOkResponse, ApiUnauthorizedResponse } from "@nestjs/swagger";
import { MeDto } from "./me.dto";
import { ALLOWED_LOGIN } from "./tailnet.guard";

@Controller("me")
export class MeController {
  constructor(@Inject(ALLOWED_LOGIN) private readonly login: string) {}

  @Get()
  @ApiOkResponse({ type: MeDto })
  @ApiUnauthorizedResponse()
  me(): MeDto {
    return { login: this.login };
  }
}
