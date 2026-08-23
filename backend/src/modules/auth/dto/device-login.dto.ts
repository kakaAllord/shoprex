import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

/**
 * Signing in on a shop phone.
 *
 * A device belongs to a **branch**, not to one worker, so the handset no longer
 * says who is holding it and the request has to. `userId` comes from
 * `GET /auth/device/{deviceId}/people` — it is not a secret and never was. The
 * password is still the only thing that grants anything.
 *
 * There is no email here on purpose: workers do not have one.
 */
export class DeviceLoginDto {
  @ApiProperty({
    format: 'uuid',
    description:
      'The server-minted `device_id` the app stored when it redeemed its enrollment code.',
  })
  @IsUUID()
  deviceId!: string;

  @ApiProperty({
    format: 'uuid',
    description:
      'Who is signing in — one of the people `GET /auth/device/{deviceId}/people` lists for this phone. They must be assigned to the phone’s branch, or be the owner of the business.',
  })
  @IsUUID()
  userId!: string;

  @ApiProperty({
    minLength: 8,
    maxLength: 72,
    description: 'That person’s own password.',
  })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password!: string;
}
