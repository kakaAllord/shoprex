import { ApiProperty } from '@nestjs/swagger';
import { UserPermission, UserRole } from '@prisma/client';
import type {
  AuthenticatedProfile,
  DevCredential,
  DeviceSignInOption,
  LoginResult,
} from '../auth.service';

export class AuthenticatedProfileDto implements AuthenticatedProfile {
  @ApiProperty({
    format: 'uuid',
    description:
      'Server-minted internal id, used for audit attribution. Never a sign-in secret.',
  })
  id!: string;

  @ApiProperty({
    nullable: true,
    type: String,
    example: 'owner@shoprex.co.tz',
    description:
      'Null for workers, who are created with a name and sign in on the device enrolled to them.',
  })
  email!: string | null;

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
    enum: UserPermission,
    isArray: true,
    example: [UserPermission.SELL],
    description:
      'What this person may do operationally, within their role. Enforced on the server — a client must not treat an empty list as merely a rendering hint.',
  })
  permissions!: UserPermission[];

  @ApiProperty({
    nullable: true,
    type: String,
    format: 'uuid',
    description:
      'The enrolled device this session is bound to. Present only for a worker signed in through `POST /auth/device/login`; revoking that device ends the session on its next request.',
  })
  deviceId!: string | null;

  @ApiProperty({
    type: [String],
    format: 'uuid',
    description:
      'The branches this person may act on. Every branch of the business for an owner; the assigned ones for a manager or worker.',
  })
  branchIds!: string[];

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

/**
 * One name on the sign-in screen. Deliberately the whole shape: an id and a
 * name, never a credential, an email, or a permission set.
 */
export class DeviceSignInOptionDto implements DeviceSignInOption {
  @ApiProperty({ format: 'uuid' })
  userId!: string;

  @ApiProperty({ example: 'Juma Hassan' })
  fullName!: string;
}
