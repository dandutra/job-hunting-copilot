import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Res,
} from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { FeedCorrectionService } from "./feed-correction.service";
import { LabelQueueService } from "./label-queue.service";
import {
  FeedCorrectionBodyDto,
  FeedCorrectionStoredDto,
  LabelStoredDto,
  QueuePostingDto,
  SubmitLabelDto,
} from "./labels.dto";
import { parseFeedCorrection, parseSubmitLabel } from "./parse";

@Controller()
@ApiUnauthorizedResponse()
export class LabelsController {
  constructor(
    private readonly queue: LabelQueueService,
    private readonly corrections: FeedCorrectionService,
  ) {}

  @Get("label-queue/next")
  @ApiOkResponse({
    type: QueuePostingDto,
    description:
      "The Posting to label. It carries nothing derived from its Tier. The same Posting comes back until it is labelled.",
  })
  @ApiNoContentResponse({
    description:
      "Nothing is due: no phase is open, the quota is met or no Posting is eligible.",
  })
  async next(
    @Res({ passthrough: true }) res: { status(code: number): unknown },
  ): Promise<QueuePostingDto | undefined> {
    const posting = await this.queue.next();
    if (posting) return posting;
    res.status(204);
    return undefined;
  }

  @Post("label-queue/labels")
  @ApiBody({ type: SubmitLabelDto })
  @ApiCreatedResponse({ type: LabelStoredDto })
  @ApiBadRequestResponse()
  @ApiConflictResponse({
    description: "The queue is not showing that Posting.",
  })
  submit(@Body() body: unknown): Promise<LabelStoredDto> {
    return this.queue.submit(parseSubmitLabel(body));
  }

  @Delete("label-queue/labels/last")
  @HttpCode(204)
  @ApiNoContentResponse({
    description:
      "The last Label of the batch under way is gone and its Posting comes next.",
  })
  @ApiConflictResponse({
    description: "No Label to undo, or the batch is done.",
  })
  undo(): Promise<void> {
    return this.queue.undoLast();
  }

  @Post("postings/:id/feed-correction")
  @ApiBody({ type: FeedCorrectionBodyDto })
  @ApiCreatedResponse({ type: FeedCorrectionStoredDto })
  @ApiBadRequestResponse()
  @ApiNotFoundResponse()
  @ApiConflictResponse({
    description: "The Posting has no Tier, or the Tier is already that one.",
  })
  correct(
    @Param("id", ParseIntPipe) id: number,
    @Body() body: unknown,
  ): Promise<FeedCorrectionStoredDto> {
    return this.corrections.correct(id, parseFeedCorrection(body));
  }
}
