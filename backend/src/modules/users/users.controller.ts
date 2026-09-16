import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { ErrorResponseDto } from '../../common/dto/error-response.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { BEARER_AUTH } from '../../docs/swagger';
import { CreateManagerDto } from './dto/create-manager.dto';
import { CreateWorkerDto } from './dto/create-worker.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { StaffMemberViewDto } from './dto/staff-response.dto';
import { UpdatePermissionsDto } from './dto/update-permissions.dto';
import { UpdateUserStatusDto } from './dto/update-status.dto';
import { StaffMemberView, UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth(BEARER_AUTH)
@SkipThrottle({ auth: true })
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @ApiOperation({
    summary: 'Create a delegated manager',
    description:
      'Owners only. The manager receives email-and-password credentials for the web console and is scoped to the branches named in `branchIds`, each of which must belong to the caller’s own business.',
  })
  @ApiCreatedResponse({ type: StaffMemberViewDto })
  @ApiConflictResponse({
    type: ErrorResponseDto,
    description: 'That email address or phone number is already registered.',
  })
  @ApiNotFoundResponse({
    type: ErrorResponseDto,
    description:
      'One of the branch ids is not a branch of the caller’s business — the same answer a branch in another tenant gives.',
  })
  @Roles(UserRole.OWNER)
  @Post('managers')
  createManager(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateManagerDto,
  ): Promise<StaffMemberView> {
    return this.usersService.createManager(user, dto);
  }

  @ApiOperation({
    summary: 'Create a worker',
    description:
      'Owners only. A worker is created with a name, a password, one branch, and a permission set — no email address, because a worker signs in on the device enrolled to them rather than in the web console. Creating the worker does **not** enroll a device; issue an enrollment code separately.',
  })
  @ApiCreatedResponse({ type: StaffMemberViewDto })
  @ApiConflictResponse({
    type: ErrorResponseDto,
    description: 'That phone number is already registered.',
  })
  @ApiNotFoundResponse({
    type: ErrorResponseDto,
    description: 'That branch is not a branch of the caller’s business.',
  })
  @Roles(UserRole.OWNER)
  @Post('workers')
  createWorker(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateWorkerDto,
  ): Promise<StaffMemberView> {
    return this.usersService.createWorker(user, dto);
  }

  @ApiOperation({
    summary: 'List managers and workers',
    description:
      'Owners see every manager and worker in their own business. A manager sees only the staff of the branches they are themselves assigned to. Owners and platform administrators are not listed here.',
  })
  @ApiOkResponse({ type: [StaffMemberViewDto] })
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  @Get()
  list(@CurrentUser() user: AuthenticatedUser): Promise<StaffMemberView[]> {
    return this.usersService.listForPrincipal(user);
  }

  @ApiOperation({
    summary: 'One manager or worker',
    description:
      'A staff member in another tenant answers **404, not 403** — a caller must not learn that a user id exists in someone else’s business. A manager asking about staff outside their own branches gets the same 404.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: StaffMemberViewDto })
  @ApiNotFoundResponse({
    type: ErrorResponseDto,
    description:
      'No such staff member in the caller’s business — also the answer for another tenant’s user, and for a manager reaching outside their branches.',
  })
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  @Get(':id')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<StaffMemberView> {
    return this.usersService.findOne(user, id);
  }

  @ApiOperation({
    summary: 'Set what a person may do',
    description:
      'Owners only. Replaces the permission set outright rather than merging, so a permission left out of the request is a permission taken away. The change is recorded in the audit log.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: StaffMemberViewDto })
  @ApiNotFoundResponse({
    type: ErrorResponseDto,
    description: 'No such staff member in the caller’s business.',
  })
  @Roles(UserRole.OWNER)
  @Patch(':id/permissions')
  updatePermissions(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePermissionsDto,
  ): Promise<StaffMemberView> {
    return this.usersService.updatePermissions(user, id, dto);
  }

  @ApiOperation({
    summary: 'Set a staff member\u2019s password',
    description:
      'Owner only, and for a **worker it is the only recovery there is**. Workers are created without an email on purpose \u2014 doc 01 \u00a73 \u2014 so there is no address to send a reset link to and no "forgot password" to fall back on. Without this route a worker who forgets their password needs a developer with database access, which a pilot shop does not have.\n\nNo current password is asked for: the owner does not know it, and within their own business the owner is the authority. The same scoping as every other route here applies, so an owner cannot reach another tenant\u2019s people, a platform administrator, or themselves \u2014 their own password goes through `PATCH /auth/password`.\n\n**It does not end the person\u2019s sessions.** This route is mostly for a forgotten password, where that would be gratuitous. Locking somebody out is a different act with its own route: `PATCH :id/status`.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: StaffMemberViewDto })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: 'The password is shorter than 8 characters.',
  })
  @ApiNotFoundResponse({
    type: ErrorResponseDto,
    description:
      'No such staff member in the caller\u2019s business \u2014 the answer for another tenant\u2019s person too.',
  })
  @Roles(UserRole.OWNER)
  @Post(':id/password')
  @HttpCode(HttpStatus.OK)
  resetPassword(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResetPasswordDto,
  ): Promise<StaffMemberView> {
    return this.usersService.resetPassword(user, id, dto);
  }

  @ApiOperation({
    summary: 'Switch a staff member off, or back on',
    description:
      'Offboarding \u2014 the thing V1 had no way to do until Phase 9. Stripping every permission came close and was not the same: it stops somebody selling, but they still appear by name on the branch phone\u2019s sign-in list, and a departed **manager** could still sign into the console and read the shop, because reading a branch list or a product needs no permission at all.\n\nSwitching off reaches all of it. `User.isActive` is already checked everywhere identity is established, and `BusinessActiveGuard` refuses a token minted **before** the change on its very next request \u2014 so a session already open stops working immediately, exactly as it does for a suspended shop.\n\n**Nothing is deleted.** Their sales, their deliveries, and every audit line naming them stay as they are, so a season worker who returns is switched back on rather than recreated.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: StaffMemberViewDto })
  @ApiNotFoundResponse({
    type: ErrorResponseDto,
    description:
      'No such staff member in the caller\u2019s business. An owner cannot target themselves through this route, so nobody can lock themselves out of their own shop.',
  })
  @Roles(UserRole.OWNER)
  @Patch(':id/status')
  setActive(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserStatusDto,
  ): Promise<StaffMemberView> {
    return this.usersService.setActive(user, id, dto);
  }
}
