import { ApiProperty } from "@nestjs/swagger";

export class MeDto {
  @ApiProperty({ example: "dandutra@github" })
  login!: string;
}
