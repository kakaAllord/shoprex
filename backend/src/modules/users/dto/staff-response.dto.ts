import { ApiProperty } from '@nestjs/swagger';
import { UserPermission, UserRole } from '@prisma/client';
import type { StaffMemberView } from '../users.service';

export class StaffMemberViewDto implements StaffMemberView {
  @ApiProperty({
    format: 'uuid',
    description:
      'Minted by Shoprex at creation. Database identity and audit attribution — never a sign-in secret.',
  })
  id!: string;

  @ApiProperty({ example: 'Juma Hassan' })
  fullName!: string;

  @ApiProperty({
    nullable: true,
    example: null,
    description: 'Null for workers: they sign in on their bound device, not by email.',
  })
  email!: string | null;

  @ApiProperty({ nullable: true, example: '+255712345678' })
  phone!: string | null;

  @ApiProperty({ enum: UserRole, example: UserRole.WORKER })
  role!: UserRole;

  @ApiProperty({ enum: UserPermission, isArray: true, example: [UserPermission.SELL] })
  permissions!: UserPermission[];

  @ApiProperty({
    type: [String],
    format: 'uuid',
    description: 'The branches this person is assigned to. A worker has exactly one.',
  })
  branchIds!: string[];

  @ApiProperty({ example: true })
  isActive!: boolean;

  @ApiProperty({ format: 'date-time', nullable: true, description: 'Backend server clock.' })
  lastLoginAt!: Date | null;

  @ApiProperty({ format: 'date-time', description: 'Backend server clock.' })
  createdAt!: Date;
}
