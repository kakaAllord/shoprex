import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/** Platform administrator onboarding a new shop: business plus its first owner. */
export class CreateBusinessDto {
  @ApiProperty({ example: 'Duka la Mfano', minLength: 2, maxLength: 120 })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({
    example: 'Africa/Dar_es_Salaam',
    description: 'Defaults to the configured DEFAULT_TIMEZONE.',
    maxLength: 60,
  })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  timezone?: string;

  @ApiProperty({ example: 'Asha Mwakalinga', minLength: 2, maxLength: 120 })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  ownerFullName!: string;

  @ApiProperty({ example: 'owner@shoprex.co.tz' })
  @IsEmail()
  ownerEmail!: string;

  @ApiProperty({ minLength: 8, example: 'shoprex12345' })
  @IsString()
  @MinLength(8, { message: 'Owner password must be at least 8 characters' })
  ownerPassword!: string;
}
