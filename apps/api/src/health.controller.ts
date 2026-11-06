import { Controller, Get } from "@nestjs/common";
import { ApiOkResponse } from "@nestjs/swagger";
import { Public } from "./auth/public.decorator";
import { HealthDto } from "./health.dto";

@Public()
@Controller("health")
export class HealthController {
  @Get()
  @ApiOkResponse({ type: HealthDto })
  health(): HealthDto {
    return { status: "ok" };
  }
}
