import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

/**
 * A worker signing in on the phone enrolled to them. There is no email here on
 * purpose: the device identifies exactly one worker, so the device id and that
 * worker's password are the whole credential.
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
    minLength: 8,
    maxLength: 72,
    description: 'The password the owner set for this worker.',
  })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password!: string;
}
