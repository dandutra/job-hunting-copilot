import {
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiQuery,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import {
  LookalikeDto,
  MergeLogEntryDto,
  MergeResultDto,
  SplitResultDto,
} from "./merge-review.dto";
import { MergeReviewService } from "./merge-review.service";

@Controller()
@ApiUnauthorizedResponse()
export class MergeReviewController {
  constructor(private readonly service: MergeReviewService) {}

  @Get("merge-log")
  @ApiQuery({ name: "rule", required: false })
  @ApiQuery({
    name: "reviewed",
    required: false,
    enum: ["true", "false"],
    description: "Leave out for both.",
  })
  @ApiOkResponse({
    type: [MergeLogEntryDto],
    description: "Unreviewed entries first, then newest first.",
  })
  @ApiBadRequestResponse()
  mergeLog(
    @Query("rule") rule?: string,
    @Query("reviewed") reviewed?: string,
  ): Promise<MergeLogEntryDto[]> {
    return this.service.listMergeLog({ rule, reviewed });
  }

  @Post("merge-log/:id/review")
  @HttpCode(200)
  @ApiOkResponse({ type: MergeLogEntryDto })
  @ApiNotFoundResponse()
  review(@Param("id", ParseIntPipe) id: number): Promise<MergeLogEntryDto> {
    return this.service.markReviewed(id);
  }

  @Post("sightings/:id/split")
  @ApiCreatedResponse({
    type: SplitResultDto,
    description:
      "The Sighting now sits on its own Posting. The pair is recorded as not the same, so no later poll rejoins or relinks them.",
  })
  @ApiNotFoundResponse()
  @ApiConflictResponse({
    description: "It is the only Sighting on its Posting.",
  })
  split(@Param("id", ParseIntPipe) id: number): Promise<SplitResultDto> {
    return this.service.split(id);
  }

  @Get("lookalikes")
  @ApiOkResponse({ type: [LookalikeDto] })
  lookalikes(): Promise<LookalikeDto[]> {
    return this.service.listLookalikes();
  }

  @Post("lookalikes/:id/merge")
  @HttpCode(200)
  @ApiOkResponse({ type: MergeResultDto })
  @ApiNotFoundResponse()
  @ApiConflictResponse({ description: "Both Companies are Watched companies." })
  merge(@Param("id", ParseIntPipe) id: number): Promise<MergeResultDto> {
    return this.service.mergeLookalike(id);
  }

  @Post("lookalikes/:id/dismiss")
  @HttpCode(204)
  @ApiNoContentResponse({
    description: "The pair is recorded as not the same.",
  })
  @ApiNotFoundResponse()
  dismiss(@Param("id", ParseIntPipe) id: number): Promise<void> {
    return this.service.dismissLookalike(id);
  }
}
