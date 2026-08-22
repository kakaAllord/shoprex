import { ApiProperty } from '@nestjs/swagger';
import { DeviceStatus } from '@prisma/client';
import type {
  DeviceView,
  EnrolledDeviceView,
  IssuedEnrollmentView,
} from '../devices.service';

export class DeviceViewDto implements DeviceView {
  @ApiProperty({
    format: 'uuid',
    description:
      'The server-minted `device_id`. Android exposes no reliable permanent hardware identifier, so Shoprex mints its own at enrollment and the app stores it. A client never supplies this.',
  })
  id!: string;

  @ApiProperty({
    example: 'Juma Hassan',
    description: 'The worker’s own name, so the owner can see whose phone this is.',
  })
  name!: string;

  @ApiProperty({ format: 'uuid' })
  branchId!: string;

  @ApiProperty({ format: 'uuid', description: 'The one worker this device belongs to.' })
  userId!: string;

  @ApiProperty({ example: 'Juma Hassan' })
  workerName!: string;

  @ApiProperty({
    enum: DeviceStatus,
    description: 'A REVOKED device is refused by the backend on its very next request.',
  })
  status!: DeviceStatus;

  @ApiProperty({
    format: 'date-time',
    nullable: true,
    description: 'Set by the backend at enrollment and at each device sign-in.',
  })
  lastSeenAt!: Date | null;

  @ApiProperty({ format: 'date-time', nullable: true })
  revokedAt!: Date | null;

  @ApiProperty({ format: 'date-time', description: 'Backend server clock.' })
  createdAt!: Date;
}

export class IssuedEnrollmentViewDto implements IssuedEnrollmentView {
  @ApiProperty({ format: 'uuid' })
  enrollmentId!: string;

  @ApiProperty({
    description:
      'The one-time code, shown **once**. It is stored only as a SHA-256 hash and is never returned by any later request — if it is lost, issue a new one.',
  })
  code!: string;

  @ApiProperty({ format: 'date-time', description: 'Backend server clock.' })
  expiresAt!: Date;

  @ApiProperty({ format: 'uuid' })
  userId!: string;

  @ApiProperty({ example: 'Juma Hassan' })
  workerName!: string;

  @ApiProperty({ format: 'uuid', description: 'Taken from the worker’s own branch assignment.' })
  branchId!: string;
}

export class EnrolledDeviceViewDto implements EnrolledDeviceView {
  @ApiProperty({
    format: 'uuid',
    description: 'Store this on the device. It is what the app signs in with from now on.',
  })
  deviceId!: string;

  @ApiProperty({ example: 'Juma Hassan' })
  deviceName!: string;

  @ApiProperty({ format: 'uuid' })
  businessId!: string;

  @ApiProperty({ example: 'Duka la Kariakoo' })
  businessName!: string;

  @ApiProperty({ format: 'uuid' })
  branchId!: string;

  @ApiProperty({ example: 'Tawi la Kariakoo' })
  branchName!: string;

  @ApiProperty({ format: 'uuid' })
  workerId!: string;

  @ApiProperty({ example: 'Juma Hassan' })
  workerName!: string;

  @ApiProperty({ format: 'date-time', description: 'Backend server clock.' })
  enrolledAt!: Date;
}
