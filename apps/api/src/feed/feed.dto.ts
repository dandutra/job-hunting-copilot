import { ApiProperty } from "@nestjs/swagger";
import { TIER_VALUES, TierValue } from "../labels/labels.dto";

export const POSTING_STATES = ["open", "closed", "stale"] as const;
export type PostingStateValue = (typeof POSTING_STATES)[number];

class PostingCoreDto {
  @ApiProperty() id!: number;
  @ApiProperty() title!: string;
  @ApiProperty() company!: string;
  @ApiProperty() location!: string;
  @ApiProperty({
    type: String,
    format: "date-time",
    description: "The earliest Sighting's date.",
  })
  postedAt!: string;
  @ApiProperty() sightingCount!: number;
  @ApiProperty({
    description: "True when the Posting has no full description yet.",
  })
  thin!: boolean;
  @ApiProperty({
    type: [String],
    description:
      "The Tier caps that hold the Posting at C: closed_to_juniors, outside_gta, us_only, security_clearance or requires_french. Empty when none applies.",
  })
  capsApplied!: string[];
  @ApiProperty({ description: "True when the Posting has an open Lookalike." })
  hasLookalike!: boolean;
  @ApiProperty({
    enum: TIER_VALUES,
    nullable: true,
    description:
      "The user's newest Feed correction, or null. It is never a Label.",
  })
  feedCorrection!: TierValue | null;
  @ApiProperty({
    enum: POSTING_STATES,
    description: "Closed and Stale Postings come only with include=closed.",
  })
  state!: PostingStateValue;
}

export class FeedItemDto extends PostingCoreDto {
  @ApiProperty({ enum: TIER_VALUES }) tier!: TierValue;
}

export class FactorDto {
  @ApiProperty({
    enum: ["skills_covered", "level_match", "role_family", "work_arrangement"],
  })
  factor!: string;
  @ApiProperty({ description: "What Jev answered, as text." }) answer!: string;
  @ApiProperty() points!: number;
}

export class ThresholdsDto {
  @ApiProperty() a!: number;
  @ApiProperty() b!: number;
}

export class WhyDto {
  @ApiProperty({ description: "The points before any Tier cap." })
  total!: number;
  @ApiProperty({ type: ThresholdsDto }) thresholds!: ThresholdsDto;
  @ApiProperty({ type: [FactorDto] }) factors!: FactorDto[];
  @ApiProperty({
    description:
      "True when the tier config changed after this Tier was computed, so the points may not match the Tier until tier:recompute runs.",
  })
  stale!: boolean;
}

export class LinkDto {
  @ApiProperty() url!: string;
  @ApiProperty({
    type: [String],
    description: "Every Job source that reported this URL.",
  })
  jobSources!: string[];
}

export class LookalikeOtherDto {
  @ApiProperty() id!: number;
  @ApiProperty() title!: string;
  @ApiProperty() company!: string;
  @ApiProperty() location!: string;
  @ApiProperty({ enum: TIER_VALUES, nullable: true, type: String })
  tier!: TierValue | null;
}

export class LookalikeHintDto {
  @ApiProperty({ description: "The id the merge and dismiss endpoints take." })
  id!: number;
  @ApiProperty({
    description: "similar_title, similar_company, board_tie or same_title.",
  })
  reason!: string;
  @ApiProperty({ type: LookalikeOtherDto }) other!: LookalikeOtherDto;
}

export class PostingDetailDto extends PostingCoreDto {
  @ApiProperty({
    enum: TIER_VALUES,
    nullable: true,
    type: String,
    description: "Null when no Tier has been computed yet.",
  })
  tier!: TierValue | null;
  @ApiProperty({ type: String, nullable: true })
  workArrangement!: string | null;
  @ApiProperty({ type: String, nullable: true }) roleFamily!: string | null;
  @ApiProperty({
    type: WhyDto,
    nullable: true,
    description:
      "Null when the stored answers or the tier config cannot be read. Computed with the config as it is now; see stale.",
  })
  why!: WhyDto | null;
  @ApiProperty() descriptionKind!: string;
  @ApiProperty({ description: "Empty when the Posting has no text." })
  description!: string;
  @ApiProperty({ type: [LinkDto] }) links!: LinkDto[];
  @ApiProperty({ type: [LookalikeHintDto] }) lookalikes!: LookalikeHintDto[];
}
