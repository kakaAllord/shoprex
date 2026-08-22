import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MaxLength, MinLength, Validate } from 'class-validator';
import type { ValidatorConstraintInterface } from 'class-validator';
import { ValidatorConstraint } from 'class-validator';
import { isValidTanzanianPhone } from '../../../domain/phone';

@ValidatorConstraint({ name: 'tanzanianPhone', async: false })
export class IsTanzanianPhone implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return typeof value === 'string' && isValidTanzanianPhone(value);
  }

  defaultMessage(): string {
    return 'Namba ya simu si sahihi · Enter a Tanzanian mobile number, e.g. 0712345678';
  }
}

/**
 * Owner self-registration: a shopkeeper creates their own account and their
 * shop in one step. No platform administrator is involved.
 */
export class SignupDto {
  @ApiProperty({ example: 'Duka la Mfano', minLength: 2, maxLength: 120 })
  @IsString()
  @MinLength(2, { message: 'Shop name must be at least 2 characters' })
  @MaxLength(120)
  shopName!: string;

  @ApiProperty({ example: 'owner@shoprex.co.tz' })
  @IsEmail({}, { message: 'A valid email address is required' })
  email!: string;

  @ApiProperty({
    example: '0712345678',
    description:
      'Tanzanian mobile number in any spelling (0712345678, +255712345678, 255 712 345 678). Stored canonicalised as +255712345678.',
  })
  @Validate(IsTanzanianPhone)
  phone!: string;

  @ApiProperty({ minLength: 8, maxLength: 200, example: 'shoprex12345' })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @MaxLength(200)
  password!: string;

  /** Optional: defaults to the email name when the owner does not supply one. */
  @ApiPropertyOptional({
    example: 'Asha Mwakalinga',
    description: 'Defaults to the email name when the owner does not supply one.',
    maxLength: 120,
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  fullName?: string;
}
