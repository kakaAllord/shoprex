import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import type { AuthenticatedProfile, DevCredential, LoginResult } from '../auth.service';

export class AuthenticatedProfileDto implements AuthenticatedProfile {
  @ApiProperty({
    format: 'uuid',
    description:
      'Server-minted internal id, used for audit attribution. Never a sign-in secret.',
  })
  id!: string;

  @ApiProperty({ example: 'owner@shoprex.co.tz' })
  email!: string;

  @ApiProperty({
    nullable: true,
    type: String,
    example: '+255712345678',
    description: 'Always stored canonicalised, whatever spelling was submitted.',
  })
  phone!: string | null;

  @ApiProperty({ example: 'Asha Mwakalinga' })
  fullName!: string;

  @ApiProperty({ enum: UserRole, example: UserRole.OWNER })
  role!: UserRole;

  @ApiProperty({
    nullable: true,
    type: String,
    format: 'uuid',
    description: 'The tenant. Null only for platform administrators.',
  })
  businessId!: string | null;

  @ApiProperty({ nullable: true, type: String, example: 'Duka la Mfano' })
  businessName!: string | null;

  @ApiProperty({
    enum: ['admin', 'owner'],
    description:
      'Which web console this account belongs to. The backend decides; clients follow it and never ask the user.',
  })
  console!: 'admin' | 'owner';
}

export class LoginResultDto implements LoginResult {
  @ApiProperty({ description: 'JWT bearer token.' })
  accessToken!: string;

  @ApiProperty({ example: '8h', description: 'Token lifetime. V1 has no refresh token.' })
  expiresIn!: string;

  @ApiProperty({ type: AuthenticatedProfileDto })
  user!: AuthenticatedProfile;
}

export class DevCredentialDto implements DevCredential {
  @ApiProperty({ example: 'Owner · Duka la Mfano' })
  label!: string;

  @ApiProperty({ example: 'owner@shoprex.co.tz' })
  email!: string;

  @ApiProperty({ example: 'shoprex12345' })
  password!: string;

  @ApiProperty({ enum: UserRole })
  role!: UserRole;
}
