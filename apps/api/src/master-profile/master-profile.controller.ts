import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Put,
} from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import {
  ImportProfileDto,
  ImportResultDto,
  LatestVersionDto,
  RejectedProfileDto,
} from "./master-profile.dto";
import { MasterProfileService } from "./master-profile.service";

@Controller("master-profile")
export class MasterProfileController {
  constructor(private readonly service: MasterProfileService) {}

  @Put()
  @ApiOkResponse({ type: ImportResultDto })
  @ApiBadRequestResponse({ type: RejectedProfileDto })
  @ApiUnauthorizedResponse()
  import(@Body() body: ImportProfileDto): Promise<ImportResultDto> {
    const yaml: unknown = body?.yaml;
    if (typeof yaml !== "string" || yaml.trim() === "")
      throw new BadRequestException({
        errors: [{ id: "(file)", message: "yaml must be the file's text" }],
      });
    return this.service.import(yaml);
  }

  @Get("latest")
  @ApiOkResponse({ type: LatestVersionDto })
  @ApiNotFoundResponse({ description: "No version is stored." })
  @ApiUnauthorizedResponse()
  latest(): Promise<LatestVersionDto> {
    return this.service.latestVersion();
  }
}
