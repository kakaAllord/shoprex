import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Changing your own password.
 *
 * `currentPassword` is required and is not ceremony: without it, anyone who
 * reaches an unlocked browser — or a session token lifted from one — can lock
 * the real owner out of their own shop in a single request. Proving the
 * current password is what keeps a *stolen session* from becoming a *stolen
 * account*.
 */
export class ChangePasswordDto {
  @ApiProperty({ description: 'The password being replaced. Proves this is really you.' })
  @IsString()
  @MinLength(1)
  currentPassword!: string;

  @ApiProperty({ minLength: 8, maxLength: 128, example: 'nenosiri-jipya-2026' })
  @IsString()
  @MinLength(8, { message: 'Nenosiri jipya lazima liwe na herufi 8 au zaidi' })
  @MaxLength(128)
  newPassword!: string;
}
