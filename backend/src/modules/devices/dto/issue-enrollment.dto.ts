import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';

/**
 * A code binds a phone to a **branch**, so the owner names the branch.
 *
 * It used to name a worker, and the branch was derived from that worker's own
 * assignment. Since 2026-08-23 a device belongs to a branch and any worker
 * there signs in on it, so there is no worker to derive anything from — see
 * PROGRESS.md §2a.
 */
export class IssueEnrollmentDto {
  @ApiProperty({
    format: 'uuid',
    description:
      'The branch this phone will belong to. It must belong to the caller’s own business — a branch from another tenant answers **404**. The tenant is never accepted here; it comes from the token.',
  })
  @IsUUID()
  branchId!: string;

  @ApiProperty({
    example: 'Simu ya kaunta',
    minLength: 2,
    maxLength: 80,
    description:
      'What the owner calls this handset, so they can tell one from another in the device list. A label, never an identity or a credential.',
  })
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  deviceName!: string;

  @ApiPropertyOptional({
    example: 60,
    minimum: 5,
    maximum: 1440,
    description:
      'How long the code stays valid. Defaults to `DEVICE_ENROLLMENT_TTL_MINUTES`. Short on purpose — the code is a secret handed over on paper.',
  })
  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(1440)
  expiresInMinutes?: number;
}
