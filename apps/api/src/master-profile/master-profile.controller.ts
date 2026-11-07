import { BadRequestException, Body, Controller, Put } from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiOkResponse,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import {
  ImportProfileDto,
  ImportResultDto,
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
}
