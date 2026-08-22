import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserPermission } from '@prisma/client';
import {
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * A worker is created with a name and a password and nothing else. There is no
 * email field on purpose: workers never use the web console, and the device
 * enrolled to them is what identifies them at sign-in.
 */
export class CreateWorkerDto {
  @ApiProperty({ example: 'Juma Hassan', minLength: 2, maxLength: 120 })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  fullName!: string;

  @ApiPropertyOptional({
    example: '0712345678',
    description:
      'Optional. Recorded so the owner can reach the worker; it is not a sign-in credential.',
  })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({
    minLength: 8,
    maxLength: 72,
    description:
      'Set by the owner and handed to the worker. It is what the worker types on their enrolled device. Stored only as a bcrypt hash.',
  })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password!: string;

  @ApiProperty({
    format: 'uuid',
    description:
      'The one branch this worker sells in, and the branch their device will be bound to. It must belong to the caller’s own business — a branch from another tenant answers **404**. The tenant is never accepted here; it comes from the token.',
  })
  @IsUUID()
  branchId!: string;

  @ApiProperty({
    enum: UserPermission,
    isArray: true,
    example: [UserPermission.SELL],
    description:
      'What this worker may do. May be empty, which means no operational permission has been granted yet.',
  })
  @IsArray()
  @IsEnum(UserPermission, { each: true })
  permissions!: UserPermission[];
}
