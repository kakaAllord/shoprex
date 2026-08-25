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
    example: 'Simu ya kaunta',
    description:
      'What the owner calls this handset, so they can tell one from another. A label — a device belongs to a branch, not to a person, so this is not an identity.',
  })
  name!: string;

  @ApiProperty({ format: 'uuid', description: 'The branch this phone belongs to.' })
  branchId!: string;

  @ApiProperty({ example: 'Tawi Kuu' })
  branchName!: string;

  @ApiProperty({
    enum: DeviceStatus,
    description: 'A REVOKED device is refused by the backend on its very next request.',
  })
  status!: DeviceStatus;

  @ApiProperty({
    format: 'date-time',
    nullable: true,
    description: 'Set by the backend at enrollment and at each sign-in on this phone.',
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

  @ApiProperty({
    description:
      'The same one-time code drawn as a scannable SVG, so a phone at the counter can read it rather than somebody spelling it out. It carries the **bare code and nothing else** — a scan and a typed entry hand the redemption route an identical string. Shown **once**, on exactly the same terms as `code`, and never stored.',
  })
  qrSvg!: string;

  @ApiProperty({ format: 'date-time', description: 'Backend server clock.' })
  expiresAt!: Date;

  @ApiProperty({
    example: 'Simu ya kaunta',
    description: 'What the phone will be called once it redeems this code.',
  })
  deviceName!: string;

  @ApiProperty({
    format: 'uuid',
    description: 'The branch this code will bind a phone to, named by the owner.',
  })
  branchId!: string;

  @ApiProperty({ example: 'Tawi Kuu' })
  branchName!: string;
}

export class EnrolledDeviceViewDto implements EnrolledDeviceView {
  @ApiProperty({
    format: 'uuid',
    description: 'Store this on the device. It is what the app signs in with from now on.',
  })
  deviceId!: string;

  @ApiProperty({ example: 'Simu ya kaunta' })
  deviceName!: string;

  @ApiProperty({ format: 'uuid' })
  businessId!: string;

  @ApiProperty({ example: 'Duka la Kariakoo' })
  businessName!: string;

  @ApiProperty({ format: 'uuid' })
  branchId!: string;

  @ApiProperty({
    example: 'Tawi la Kariakoo',
    description:
      'The branch this phone now belongs to. Anyone assigned to it may sign in here with their own password.',
  })
  branchName!: string;

  @ApiProperty({ format: 'date-time', description: 'Backend server clock.' })
  enrolledAt!: Date;
}
