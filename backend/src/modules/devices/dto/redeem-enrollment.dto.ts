import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class RedeemEnrollmentDto {
  @ApiProperty({
    example: '7KQ4-9XMR-2PT8',
    description:
      'The code the owner handed to the worker. Case and dashes are forgiven — a worker typing `7kq49xmr2pt8` on a phone is accepted. The code is single-use and short-lived.',
  })
  @IsString()
  @MinLength(12)
  @MaxLength(32)
  code!: string;
}
