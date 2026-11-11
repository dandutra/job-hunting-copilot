import { ApiProperty } from "@nestjs/swagger";

export class SightingSummaryDto {
  @ApiProperty() id!: number;
  @ApiProperty() jobSource!: string;
  @ApiProperty() url!: string;
}

export class CompanySummaryDto {
  @ApiProperty() id!: number;
  @ApiProperty() name!: string;
}

export class PostingSummaryDto {
  @ApiProperty() id!: number;
  @ApiProperty() title!: string;
  @ApiProperty({ type: CompanySummaryDto }) company!: CompanySummaryDto;
  @ApiProperty() location!: string;
  @ApiProperty({ type: [SightingSummaryDto] }) sightings!: SightingSummaryDto[];
}

export class MergeLogEntryDto {
  @ApiProperty() id!: number;
  @ApiProperty({
    description:
      "shared_listing_key, direct_url, text_similarity or manual_merge.",
  })
  rule!: string;
  @ApiProperty({
    type: "object",
    additionalProperties: true,
    description: "What the rule measured; the keys depend on the rule.",
  })
  evidence!: Record<string, unknown>;
  @ApiProperty({ type: String, format: "date-time" }) createdAt!: string;
  @ApiProperty({
    type: String,
    format: "date-time",
    nullable: true,
    description:
      "Null while the entry waits for review. Exact-key and manual merges are stored reviewed.",
  })
  reviewedAt!: string | null;
  @ApiProperty({ nullable: true, type: Number }) sightingId!: number | null;
  @ApiProperty({ nullable: true, type: Number })
  absorbedPostingId!: number | null;
  @ApiProperty({
    type: PostingSummaryDto,
    description:
      "The merged Posting as it is now, with every Sighting it holds.",
  })
  posting!: PostingSummaryDto;
}

export class LookalikeDto {
  @ApiProperty() id!: number;
  @ApiProperty({
    description: "similar_title, similar_company, board_tie or same_title.",
  })
  reason!: string;
  @ApiProperty({ type: String, format: "date-time" }) createdAt!: string;
  @ApiProperty({
    type: [PostingSummaryDto],
    description: "The two Postings, the lower id first.",
  })
  postings!: PostingSummaryDto[];
}

export class SplitResultDto {
  @ApiProperty({ description: "The new Posting that holds the Sighting." })
  postingId!: number;
  @ApiProperty({ description: "The Posting the Sighting left." })
  originalPostingId!: number;
}

export class MergeResultDto {
  @ApiProperty({ description: "The surviving Posting, the lower id." })
  postingId!: number;
}
