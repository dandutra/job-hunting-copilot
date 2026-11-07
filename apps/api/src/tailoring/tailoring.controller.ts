import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
} from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from "@nestjs/swagger";
import {
  RejectDto,
  ResumeStatusDto,
  ReviewDto,
  SubmitDraftDto,
  TailoredResumeDto,
  TailoringInputDto,
  TraceRejectionDto,
} from "./tailoring.dto";
import { TailoringService } from "./tailoring.service";

@Controller()
@ApiUnauthorizedResponse()
@ApiNotFoundResponse()
export class TailoringController {
  constructor(private readonly service: TailoringService) {}

  @Get("postings/:id/tailoring-input")
  @ApiOkResponse({ type: TailoringInputDto })
  @ApiConflictResponse({ description: "No Master profile version is stored." })
  input(@Param("id", ParseIntPipe) id: number): Promise<TailoringInputDto> {
    return this.service.input(id);
  }

  @Post("postings/:id/tailored-resumes")
  @ApiCreatedResponse({ type: ResumeStatusDto })
  @ApiUnprocessableEntityResponse({ type: TraceRejectionDto })
  submit(
    @Param("id", ParseIntPipe) id: number,
    @Body() body: SubmitDraftDto,
  ): Promise<ResumeStatusDto> {
    return this.service.submit(id, body);
  }

  @Get("tailored-resumes/:id")
  @ApiOkResponse({ type: TailoredResumeDto })
  get(@Param("id", ParseIntPipe) id: number): Promise<TailoredResumeDto> {
    return this.service.get(id);
  }

  @Post("tailored-resumes/:id/review")
  @HttpCode(200)
  @ApiOkResponse({ type: ResumeStatusDto })
  @ApiBadRequestResponse()
  @ApiConflictResponse()
  review(
    @Param("id", ParseIntPipe) id: number,
    @Body() body: ReviewDto,
  ): Promise<ResumeStatusDto> {
    return this.service.review(id, body);
  }

  @Post("tailored-resumes/:id/approve")
  @HttpCode(200)
  @ApiOkResponse({ type: ResumeStatusDto })
  @ApiUnprocessableEntityResponse({ type: TraceRejectionDto })
  @ApiConflictResponse()
  approve(@Param("id", ParseIntPipe) id: number): Promise<ResumeStatusDto> {
    return this.service.approve(id);
  }

  @Post("tailored-resumes/:id/reject")
  @HttpCode(200)
  @ApiOkResponse({ type: ResumeStatusDto })
  @ApiBadRequestResponse()
  @ApiConflictResponse()
  reject(
    @Param("id", ParseIntPipe) id: number,
    @Body() body: RejectDto,
  ): Promise<ResumeStatusDto> {
    return this.service.reject(id, body);
  }
}
