import { ApiProperty } from '@nestjs/swagger';
import { AuditAction, UserRole } from '@prisma/client';
import type { AuditEventView } from '../audit.service';

export class AuditEventViewDto implements AuditEventView {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: AuditAction, example: AuditAction.DEVICE_ENROLLED })
  action!: AuditAction;

  @ApiProperty({
    example: 'Kifaa cha Neema Mushi kimeunganishwa · Device enrolled for Neema Mushi',
    description: 'A short readable line. Never contains an enrollment code or any other secret.',
  })
  summary!: string;

  @ApiProperty({ format: 'uuid', nullable: true, description: 'Null for business-wide actions.' })
  branchId!: string | null;

  @ApiProperty({ format: 'uuid', nullable: true, description: 'Who acted.' })
  actorUserId!: string | null;

  @ApiProperty({ example: 'Neema Mushi', nullable: true })
  actorName!: string | null;

  @ApiProperty({ enum: UserRole, nullable: true })
  actorRole!: UserRole | null;

  @ApiProperty({
    format: 'uuid',
    nullable: true,
    description: 'The enrolled device the action came from, when it came from one.',
  })
  deviceId!: string | null;

  @ApiProperty({ example: 'Device', nullable: true })
  targetType!: string | null;

  @ApiProperty({ format: 'uuid', nullable: true })
  targetId!: string | null;

  @ApiProperty({
    format: 'date-time',
    description: 'Set by the backend server clock. No client supplies this.',
  })
  createdAt!: Date;
}
