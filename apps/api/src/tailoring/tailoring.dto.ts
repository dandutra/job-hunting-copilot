import { ApiProperty } from "@nestjs/swagger";

export class LineDto {
  @ApiProperty() text!: string;
  @ApiProperty({ type: [String], description: "Entry IDs the line cites." })
  cites!: string[];
}

export class DraftSectionDto {
  @ApiProperty({ description: "Experience or Project ID." }) id!: string;
  @ApiProperty({ type: [LineDto] }) bullets!: LineDto[];
}

export class SkillLineDto {
  @ApiProperty() skillId!: string;
  @ApiProperty({ description: "The Skill's name or one of its aliases." })
  text!: string;
}

export class SubmitDraftDto {
  @ApiProperty({
    description: "The Master profile version the draft was written against.",
  })
  profileVersion!: string;
  @ApiProperty({ type: LineDto }) summary!: LineDto;
  @ApiProperty({
    type: [DraftSectionDto],
    description: "List every fixed Experience with no bullets.",
  })
  experiences!: DraftSectionDto[];
  @ApiProperty({ type: [DraftSectionDto] }) projects!: DraftSectionDto[];
  @ApiProperty({ type: [String] }) educationIds!: string[];
  @ApiProperty({ type: [SkillLineDto] }) skills!: SkillLineDto[];
  @ApiProperty({ type: [LineDto], required: false }) coverLetter?: LineDto[];
  @ApiProperty({
    required: false,
    description:
      "Pasted Posting text for a Thin Posting. Stored, never returned with the draft.",
  })
  postingText?: string;
}

export class TraceFailureDto {
  @ApiProperty({
    description:
      "1 to 5 are the Trace check rules, 6 is a stale profile version, shape is a malformed draft.",
  })
  rule!: string;
  @ApiProperty() location!: string;
  @ApiProperty() detail!: string;
}

export class TraceRejectionDto {
  @ApiProperty({ type: [TraceFailureDto] }) failures!: TraceFailureDto[];
}

export class ResumeStatusDto {
  @ApiProperty() id!: number;
  @ApiProperty({ enum: ["draft", "approved", "superseded", "rejected"] })
  status!: string;
}

export class InputPostingDto {
  @ApiProperty() id!: number;
  @ApiProperty() title!: string;
  @ApiProperty() company!: string;
  @ApiProperty() location!: string;
  @ApiProperty({ description: "The Posting's description as stored." })
  text!: string;
  @ApiProperty({ nullable: true, type: String }) ats!: string | null;
  @ApiProperty({
    description: "True when the description is only a snippet or missing.",
  })
  thin!: boolean;
}

export class InputExperienceDto {
  @ApiProperty() id!: string;
  @ApiProperty() employer!: string;
  @ApiProperty({ type: [String] }) titles!: string[];
  @ApiProperty() start!: string;
  @ApiProperty({ required: false }) end?: string;
  @ApiProperty() location!: string;
  @ApiProperty({ enum: ["employment", "volunteer"] }) type!: string;
  @ApiProperty() fixed!: boolean;
}

export class InputFactDto {
  @ApiProperty() id!: string;
  @ApiProperty() parent!: string;
  @ApiProperty() text!: string;
  @ApiProperty({ type: [String] }) tags!: string[];
  @ApiProperty() ownership!: string;
  @ApiProperty({ required: false }) ownership_note?: string;
  @ApiProperty({ type: [String] }) use!: string[];
  @ApiProperty({ type: [String] }) related!: string[];
}

export class InputProjectDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ type: [String] }) links!: string[];
  @ApiProperty({ required: false }) repo?: string;
}

export class InputEducationDto {
  @ApiProperty() id!: string;
  @ApiProperty() school!: string;
  @ApiProperty() program!: string;
  @ApiProperty() start!: string;
  @ApiProperty({ required: false }) end?: string;
}

export class InputSkillDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ type: [String] }) aliases!: string[];
  @ApiProperty({ type: [String] }) evidence!: string[];
}

export class InputDoNotClaimDto {
  @ApiProperty() id!: string;
  @ApiProperty() text!: string;
}

export class RejectLineDto {
  @ApiProperty({
    description:
      'A line location such as "summary" or "experiences[0].bullets[1]".',
  })
  line!: string;
  @ApiProperty({ required: false }) doNotClaimId?: string;
}

export class RejectNoteDto {
  @ApiProperty() resumeId!: number;
  @ApiProperty() note!: string;
  @ApiProperty({ type: [RejectLineDto] }) lines!: RejectLineDto[];
}

export class TailoringInputDto {
  @ApiProperty({ type: InputPostingDto }) posting!: InputPostingDto;
  @ApiProperty({ description: "The latest Master profile version ID." })
  profileVersion!: string;
  @ApiProperty({ type: [InputExperienceDto] })
  experiences!: InputExperienceDto[];
  @ApiProperty({ type: [InputFactDto] }) facts!: InputFactDto[];
  @ApiProperty({ type: [InputProjectDto] }) projects!: InputProjectDto[];
  @ApiProperty({ type: [InputEducationDto] }) education!: InputEducationDto[];
  @ApiProperty({ type: [InputSkillDto] }) skills!: InputSkillDto[];
  @ApiProperty({ type: [InputDoNotClaimDto] })
  doNotClaims!: InputDoNotClaimDto[];
  @ApiProperty({ type: [RejectNoteDto] }) rejectNotes!: RejectNoteDto[];
}

export class CitedEntryDto {
  @ApiProperty() id!: string;
  @ApiProperty({
    description: "A Fact's text, or the name of any other Entry.",
  })
  text!: string;
}

export class LineViewDto {
  @ApiProperty({ description: "The line's location in the draft." })
  line!: string;
  @ApiProperty() text!: string;
  @ApiProperty({ type: [CitedEntryDto] }) cites!: CitedEntryDto[];
}

export class ExperienceViewDto {
  @ApiProperty() id!: string;
  @ApiProperty() employer!: string;
  @ApiProperty({ type: [String] }) titles!: string[];
  @ApiProperty() start!: string;
  @ApiProperty({ required: false }) end?: string;
  @ApiProperty() location!: string;
  @ApiProperty() fixed!: boolean;
  @ApiProperty({ type: [LineViewDto] }) bullets!: LineViewDto[];
}

export class ProjectViewDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ type: [String] }) links!: string[];
  @ApiProperty({ required: false }) repo?: string;
  @ApiProperty({ type: [LineViewDto] }) bullets!: LineViewDto[];
}

export class EducationViewDto {
  @ApiProperty() id!: string;
  @ApiProperty() school!: string;
  @ApiProperty() program!: string;
  @ApiProperty() start!: string;
  @ApiProperty({ required: false }) end?: string;
}

export class SkillViewDto {
  @ApiProperty() skillId!: string;
  @ApiProperty() text!: string;
}

export class ContactViewDto {
  @ApiProperty() name!: string;
  @ApiProperty() city!: string;
  @ApiProperty() email!: string;
  @ApiProperty({ type: [String] }) links!: string[];
}

export class CoverLetterViewDto {
  @ApiProperty() greeting!: string;
  @ApiProperty({ type: [LineViewDto] }) paragraphs!: LineViewDto[];
  @ApiProperty() signOff!: string;
}

export class VerdictDto {
  @ApiProperty() line!: string;
  @ApiProperty({ enum: ["pass", "do-not-claim", "overstatement"] })
  status!: string;
  @ApiProperty({ required: false, description: "Required for do-not-claim." })
  doNotClaimId?: string;
  @ApiProperty({ required: false, description: "Required for overstatement." })
  note?: string;
}

export class ReviewDto {
  @ApiProperty({ type: [VerdictDto] }) verdicts!: VerdictDto[];
}

export class RejectDto {
  @ApiProperty() note!: string;
  @ApiProperty({ type: [RejectLineDto], required: false })
  lines?: RejectLineDto[];
}

export class TailoredResumeDto {
  @ApiProperty() id!: number;
  @ApiProperty() postingId!: number;
  @ApiProperty({ enum: ["draft", "approved", "superseded", "rejected"] })
  status!: string;
  @ApiProperty() profileVersion!: string;
  @ApiProperty() createdAt!: Date;
  @ApiProperty({ nullable: true, type: Date }) approvedAt!: Date | null;
  @ApiProperty({ type: ContactViewDto }) contact!: ContactViewDto;
  @ApiProperty({ type: LineViewDto }) summary!: LineViewDto;
  @ApiProperty({ type: [ExperienceViewDto] }) experiences!: ExperienceViewDto[];
  @ApiProperty({ type: [ProjectViewDto] }) projects!: ProjectViewDto[];
  @ApiProperty({ type: [EducationViewDto] }) education!: EducationViewDto[];
  @ApiProperty({ type: [SkillViewDto] }) skills!: SkillViewDto[];
  @ApiProperty({ type: CoverLetterViewDto, required: false })
  coverLetter?: CoverLetterViewDto;
  @ApiProperty({ type: [VerdictDto], required: false }) verdicts?: VerdictDto[];
  @ApiProperty({ required: false }) rejectNote?: string;
  @ApiProperty({ type: [RejectLineDto], required: false })
  rejectLines?: RejectLineDto[];
}
