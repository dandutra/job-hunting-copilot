import { Controller, Get, Param, ParseIntPipe, Query } from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiQuery,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { FeedItemDto, PostingDetailDto } from "./feed.dto";
import { FeedService } from "./feed.service";

@Controller("postings")
@ApiUnauthorizedResponse()
export class FeedController {
  constructor(private readonly feed: FeedService) {}

  @Get()
  @ApiQuery({
    name: "include",
    required: false,
    enum: ["closed"],
    description: "closed adds the Closed and Stale Postings.",
  })
  @ApiOkResponse({
    type: [FeedItemDto],
    description:
      "Grouped A, B, C, newest Posted at first within a Tier. A Posting with no Tier yet is left out.",
  })
  @ApiBadRequestResponse()
  list(@Query("include") include?: string): Promise<FeedItemDto[]> {
    return this.feed.list(include);
  }

  @Get(":id")
  @ApiOkResponse({
    type: PostingDetailDto,
    description: "Answers for a Closed or Stale Posting too.",
  })
  @ApiNotFoundResponse()
  detail(@Param("id", ParseIntPipe) id: number): Promise<PostingDetailDto> {
    return this.feed.detail(id);
  }
}
