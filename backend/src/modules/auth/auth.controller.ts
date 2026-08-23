import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { ErrorResponseDto } from '../../common/dto/error-response.dto';
import { Public } from '../../common/decorators/public.decorator';
import { BEARER_AUTH } from '../../docs/swagger';
import {
  AuthenticatedProfile,
  AuthService,
  DevCredential,
  DeviceSignInOption,
  LoginResult,
} from './auth.service';
import {
  AuthenticatedProfileDto,
  DevCredentialDto,
  DeviceSignInOptionDto,
  LoginResultDto,
} from './dto/auth-response.dto';
import { DeviceLoginDto } from './dto/device-login.dto';
import { LoginDto } from './dto/login.dto';
import { SignupDto } from './dto/signup.dto';

// The strict 'auth' rate-limit bucket applies here and nowhere else: every
// other controller opts out of it with @SkipThrottle({ auth: true }).
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * Owner self-registration. Creates the shop and the owner account together
   * and returns a signed-in session.
   */
  @ApiOperation({
    summary: 'Owner self-registration',
    description:
      'Creates the shop and its owner together and returns a signed-in session. No platform administrator is involved. Subject to the strict auth rate-limit bucket.',
  })
  @ApiCreatedResponse({ type: LoginResultDto })
  @ApiConflictResponse({
    type: ErrorResponseDto,
    description: 'That email address or phone number is already registered.',
  })
  @ApiTooManyRequestsResponse({
    type: ErrorResponseDto,
    description: 'Strict auth rate-limit bucket exceeded.',
  })
  @Public()
  @Post('signup')
  @HttpCode(HttpStatus.CREATED)
  signup(@Body() dto: SignupDto): Promise<LoginResult> {
    return this.authService.signupOwner(dto);
  }

  /**
   * Rate limited: password guessing is throttled per client address, since a
   * short password on a real shop account is otherwise brute-forceable.
   */
  @ApiOperation({
    summary: 'Sign in',
    description:
      'An unknown email and a wrong password are rejected identically, so the response never reveals whether an account exists. Subject to the strict auth rate-limit bucket.',
  })
  @ApiOkResponse({ type: LoginResultDto })
  @ApiUnauthorizedResponse({
    type: ErrorResponseDto,
    description: 'Unknown email or wrong password — indistinguishable by design.',
  })
  @ApiTooManyRequestsResponse({
    type: ErrorResponseDto,
    description: 'Strict auth rate-limit bucket exceeded.',
  })
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto): Promise<LoginResult> {
    return this.authService.login(dto.email, dto.password);
  }

  /**
   * Who may sign in on this phone. Unauthenticated by necessity — it is what
   * the sign-in screen shows before anybody has signed in — so it sits in the
   * strict auth rate-limit bucket like every other route a phone reaches
   * without a token.
   */
  @ApiOperation({
    summary: 'People who may sign in on this device',
    description:
      'The names the sign-in screen offers. A device belongs to a **branch**, so this lists the people assigned to that branch, plus the business owner, who reaches every branch.\n\nIt returns names and ids and nothing else — no password, no email, no permissions. Whoever holds the handset learns who works at that branch, which is a deliberate disclosure confined to one branch of one business by the `device_id`. A revoked or unknown device answers **401** and learns nothing.',
  })
  @ApiParam({ name: 'deviceId', format: 'uuid' })
  @ApiOkResponse({ type: [DeviceSignInOptionDto] })
  @ApiUnauthorizedResponse({
    type: ErrorResponseDto,
    description: 'Unknown or revoked device — indistinguishable by design.',
  })
  @ApiTooManyRequestsResponse({
    type: ErrorResponseDto,
    description: 'Strict auth rate-limit bucket exceeded.',
  })
  @Public()
  @Get('device/:deviceId/people')
  signInOptions(
    @Param('deviceId', ParseUUIDPipe) deviceId: string,
  ): Promise<DeviceSignInOption[]> {
    return this.authService.deviceSignInOptions(deviceId);
  }

  /**
   * Signing in on a shop phone. Same strict rate-limit bucket as the email
   * sign-in: this endpoint accepts a password too.
   */
  @ApiOperation({
    summary: 'Sign in on an enrolled device',
    description:
      'The phone sends the `device_id` it stored at enrollment, **who is signing in**, and that person’s own password. No email, because workers do not have one.\n\nA device belongs to a branch rather than to one worker, so the handset no longer says who is holding it and the request must. The person has to be assigned to that phone’s branch, or be the owner of the business. A revoked device, an unknown device, someone from another branch, and a wrong password are rejected identically. The returned token carries the device, so revoking the phone ends the session on its next request.',
  })
  @ApiOkResponse({ type: LoginResultDto })
  @ApiUnauthorizedResponse({
    type: ErrorResponseDto,
    description:
      'Unknown device, revoked device, unknown or deactivated person, someone not assigned to that branch, or a wrong password — indistinguishable by design.',
  })
  @ApiTooManyRequestsResponse({
    type: ErrorResponseDto,
    description: 'Strict auth rate-limit bucket exceeded.',
  })
  @Public()
  @Post('device/login')
  @HttpCode(HttpStatus.OK)
  deviceLogin(@Body() dto: DeviceLoginDto): Promise<LoginResult> {
    return this.authService.loginDevice(dto.deviceId, dto.userId, dto.password);
  }

  @ApiOperation({
    summary: 'The signed-in profile',
    description:
      'Includes `console`, which decides where the account belongs in the web app. Clients follow it rather than asking the user.',
  })
  @ApiBearerAuth(BEARER_AUTH)
  @ApiOkResponse({ type: AuthenticatedProfileDto })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto, description: 'Missing or invalid token.' })
  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser): Promise<AuthenticatedProfile> {
    return this.authService.profileFor(user);
  }

  /**
   * Development convenience: the web login form prefills itself from this list
   * so testing does not require typing credentials. Returns [] unless
   * NODE_ENV is not production AND DEV_LOGIN_AUTOFILL=true.
   */
  @ApiOperation({
    summary: 'Seeded development logins',
    description:
      'Lets the web login form prefill itself during development. Returns an empty array unless NODE_ENV is not production **and** DEV_LOGIN_AUTOFILL=true, so a deployed Shoprex can never hand out credentials.',
  })
  @ApiOkResponse({ type: [DevCredentialDto] })
  @Public()
  @Get('dev-credentials')
  devCredentials(): Promise<DevCredential[]> {
    return this.authService.devCredentials();
  }
}
