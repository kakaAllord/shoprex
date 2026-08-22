import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class IssueEnrollmentDto {
  @ApiProperty({
    format: 'uuid',
    description:
      'The worker this code enrolls. Must be an active worker in the caller’s own business — anyone else answers **404**. The branch is taken from that worker’s own assignment, never from this request.',
  })
  @IsUUID()
  userId!: string;

  @ApiPropertyOptional({
    minimum: 5,
    maximum: 1440,
    description:
      'How long the code stays valid, in minutes. Defaults to `DEVICE_ENROLLMENT_TTL_MINUTES` (60). Short on purpose: the code is a secret written on paper.',
  })
  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(1440)
  expiresInMinutes?: number;
}
