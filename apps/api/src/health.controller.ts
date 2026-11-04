import { Controller, Get } from "@nestjs/common";
import { ApiOkResponse } from "@nestjs/swagger";
import { HealthDto } from "./health.dto";

@Controller("health")
export class HealthController {
  @Get()
  @ApiOkResponse({ type: HealthDto })
  health(): HealthDto {
    return { status: "ok" };
  }
}
