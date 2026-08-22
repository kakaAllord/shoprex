import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/** Platform administrator onboarding a new shop: business plus its first owner. */
export class CreateBusinessDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  timezone?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  ownerFullName!: string;

  @IsEmail()
  ownerEmail!: string;

  @IsString()
  @MinLength(8, { message: 'Owner password must be at least 8 characters' })
  ownerPassword!: string;
}
