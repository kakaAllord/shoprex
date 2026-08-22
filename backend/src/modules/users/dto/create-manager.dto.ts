import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserPermission } from '@prisma/client';
import {
  ArrayNotEmpty,
  IsArray,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateManagerDto {
  @ApiProperty({ example: 'Neema Mushi', minLength: 2, maxLength: 120 })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  fullName!: string;

  @ApiProperty({
    example: 'neema@duka.co.tz',
    description: 'Managers sign in to the web console with an email and password.',
  })
  @IsEmail()
  email!: string;

  @ApiPropertyOptional({
    example: '0712345678',
    description: 'Any Tanzanian spelling; stored canonically as +255XXXXXXXXX.',
  })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({
    minLength: 8,
    maxLength: 72,
    description: 'Set by the owner and handed to the manager. Stored only as a bcrypt hash.',
  })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password!: string;

  @ApiProperty({
    type: [String],
    format: 'uuid',
    description:
      'The branches this manager may act on. Each must belong to the caller’s own business — a branch from another tenant answers **404**. The tenant itself is never accepted here; it comes from the token.',
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  branchIds!: string[];

  @ApiProperty({
    enum: UserPermission,
    isArray: true,
    example: [UserPermission.SELL, UserPermission.RECEIVE_STOCK, UserPermission.VIEW_REPORTS],
    description:
      'What this manager may do operationally. May be empty, which grants nothing beyond the role itself.',
  })
  @IsArray()
  @IsEnum(UserPermission, { each: true })
  permissions!: UserPermission[];
}
