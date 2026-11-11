import { ApiProperty } from "@nestjs/swagger";

export const LABEL_VALUES = ["A", "B", "C", "cant_tell"] as const;
export type LabelValue = (typeof LABEL_VALUES)[number];

export const TIER_VALUES = ["A", "B", "C"] as const;
export type TierValue = (typeof TIER_VALUES)[number];

export class QueuePostingDto {
  @ApiProperty() postingId!: number;
  @ApiProperty() title!: string;
  @ApiProperty() company!: string;
  @ApiProperty() location!: string;
  @ApiProperty({ description: "The full description." }) text!: string;
}

export class SubmitLabelDto {
  @ApiProperty({ description: "The Posting the queue is showing." })
  postingId!: number;
  @ApiProperty({ enum: LABEL_VALUES }) label!: LabelValue;
}

export class LabelStoredDto {
  @ApiProperty() id!: number;
  @ApiProperty({
    description: "True when the batch is complete, so the undo is closed.",
  })
  batchDone!: boolean;
}

export class FeedCorrectionBodyDto {
  @ApiProperty({ enum: TIER_VALUES, description: "The user's own Tier." })
  tier!: TierValue;
}

export class FeedCorrectionStoredDto {
  @ApiProperty() id!: number;
}
