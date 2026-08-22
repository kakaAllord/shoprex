import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
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
  LoginResult,
} from './auth.service';
import {
  AuthenticatedProfileDto,
  DevCredentialDto,
  LoginResultDto,
} from './dto/auth-response.dto';
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
