import { ApiProperty } from "@nestjs/swagger";

export class ImportProfileDto {
  @ApiProperty({ description: "The raw text of data/master-profile.yaml." })
  yaml!: string;
}

export class ImportResultDto {
  @ApiProperty({ description: "SHA-256 of the raw file." })
  version!: string;

  @ApiProperty({
    description: "False when this exact file was already stored.",
  })
  created!: boolean;

  @ApiProperty({ description: "Entries in the file." })
  read!: number;

  @ApiProperty({ description: "Entries the previous latest version lacked." })
  added!: number;

  @ApiProperty({
    description: "Entries newly retired since the previous latest version.",
  })
  retired!: number;
}

export class ProfileErrorDto {
  @ApiProperty({ description: 'Entry ID, or "(file)".' })
  id!: string;

  @ApiProperty()
  message!: string;
}

export class RejectedProfileDto {
  @ApiProperty({ type: [ProfileErrorDto] })
  errors!: ProfileErrorDto[];
}
