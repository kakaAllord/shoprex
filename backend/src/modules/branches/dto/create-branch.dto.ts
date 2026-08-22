import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateBranchDto {
  @ApiProperty({
    example: 'Tawi la Kariakoo',
    minLength: 2,
    maxLength: 120,
    description:
      'Unique within the business. The tenant is taken from the token, so no business id is accepted here.',
  })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;
}
