import { BadRequestException } from "@nestjs/common";
import {
  FeedCorrectionBodyDto,
  LABEL_VALUES,
  SubmitLabelDto,
  TIER_VALUES,
} from "./labels.dto";

function exactKeys(body: unknown, keys: string[]): Record<string, unknown> {
  if (typeof body !== "object" || body === null || Array.isArray(body))
    throw new BadRequestException("body must be a JSON object");
  const extra = Object.keys(body).filter((k) => !keys.includes(k));
  if (extra.length) throw new BadRequestException("body has unknown fields");
  return body as Record<string, unknown>;
}

// Messages never echo the submitted value, so a Label never reaches a log or a response.
export function parseSubmitLabel(body: unknown): SubmitLabelDto {
  const b = exactKeys(body, ["postingId", "label"]);
  if (!Number.isSafeInteger(b.postingId) || (b.postingId as number) < 1)
    throw new BadRequestException("postingId must be a positive integer");
  if (!LABEL_VALUES.includes(b.label as never))
    throw new BadRequestException("label must be A, B, C or cant_tell");
  return b as unknown as SubmitLabelDto;
}

export function parseFeedCorrection(body: unknown): FeedCorrectionBodyDto {
  const b = exactKeys(body, ["tier"]);
  if (!TIER_VALUES.includes(b.tier as never))
    throw new BadRequestException("tier must be A, B or C");
  return b as unknown as FeedCorrectionBodyDto;
}
