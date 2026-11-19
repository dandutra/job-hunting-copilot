import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  StreamableFile,
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
  PostingDraftsDto,
  PostingTextDto,
  RejectDto,
  ResumeStatusDto,
  ReviewDto,
  SubmitDraftDto,
  TailoredResumeDto,
  TailoringInputDto,
  TraceRejectionDto,
} from "./tailoring.dto";
import { TailoringService } from "./tailoring.service";

const PDF = "application/pdf";
const DOCX =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

// A header value is ASCII, so a name with other letters gets a fallback plus the RFC 5987 form.
function disposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_");
  return ascii === filename
    ? `attachment; filename="${filename}"`
    : `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

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

  @Get("postings/:id/tailored-resumes")
  @ApiOkResponse({ type: PostingDraftsDto })
  drafts(@Param("id", ParseIntPipe) id: number): Promise<PostingDraftsDto> {
    return this.service.drafts(id);
  }

  @Get("tailored-resumes/:id")
  @ApiOkResponse({ type: TailoredResumeDto })
  get(@Param("id", ParseIntPipe) id: number): Promise<TailoredResumeDto> {
    return this.service.get(id);
  }

  // Apart from the draft's own GET, which the blind Claim review reads as is.
  @Get("tailored-resumes/:id/posting-text")
  @ApiOkResponse({ type: PostingTextDto })
  postingText(@Param("id", ParseIntPipe) id: number): Promise<PostingTextDto> {
    return this.service.postingText(id);
  }

  @Get("tailored-resumes/:id/files/:name")
  @ApiOkResponse({
    description:
      "resume.pdf, resume.docx, cover-letter.pdf or cover-letter.docx of an approved draft.",
    content: {
      [PDF]: { schema: { type: "string", format: "binary" } },
      [DOCX]: { schema: { type: "string", format: "binary" } },
    },
  })
  @ApiConflictResponse({ description: "The draft was never approved." })
  async file(
    @Param("id", ParseIntPipe) id: number,
    @Param("name") name: string,
  ): Promise<StreamableFile> {
    const file = await this.service.file(id, name);
    return new StreamableFile(file.content, {
      type: name.endsWith(".pdf") ? PDF : DOCX,
      disposition: disposition(file.filename),
    });
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
