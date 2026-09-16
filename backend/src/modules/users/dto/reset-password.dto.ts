import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

/**
 * The owner setting somebody else's password.
 *
 * No `currentPassword`, deliberately — the owner does not know it and should
 * not need to. Within their own business the owner is the authority, which is
 * the same rule `PermissionsGuard` already applies when it lets an owner past
 * without checking a permission they are the one who grants.
 *
 * It is also the **only** way a worker's password can ever be recovered.
 * Workers are created without an email on purpose (doc 01 §3), so there is no
 * address to send a reset link to and no "forgot password" to fall back on. If
 * this route did not exist, a worker who forgot their password would need a
 * developer with database access.
 */
export class ResetPasswordDto {
  @ApiProperty({ minLength: 8, maxLength: 128, example: 'nenosiri-jipya-2026' })
  @IsString()
  @MinLength(8, { message: 'Nenosiri lazima liwe na herufi 8 au zaidi' })
  @MaxLength(128)
  newPassword!: string;
}
