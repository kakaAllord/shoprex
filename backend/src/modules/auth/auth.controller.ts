import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import {
  AuthenticatedProfile,
  AuthService,
  DevCredential,
  LoginResult,
} from './auth.service';
import { LoginDto } from './dto/login.dto';
import { SignupDto } from './dto/signup.dto';

// The strict 'auth' rate-limit bucket applies here and nowhere else: every
// other controller opts out of it with @SkipThrottle({ auth: true }).
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * Owner self-registration. Creates the shop and the owner account together
   * and returns a signed-in session.
   */
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
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto): Promise<LoginResult> {
    return this.authService.login(dto.email, dto.password);
  }

  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser): Promise<AuthenticatedProfile> {
    return this.authService.profileFor(user);
  }

  /**
   * Development convenience: the web login form prefills itself from this list
   * so testing does not require typing credentials. Returns [] unless
   * NODE_ENV is not production AND DEV_LOGIN_AUTOFILL=true.
   */
  @Public()
  @Get('dev-credentials')
  devCredentials(): Promise<DevCredential[]> {
    return this.authService.devCredentials();
  }
}
