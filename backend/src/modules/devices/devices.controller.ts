import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { ErrorResponseDto } from '../../common/dto/error-response.dto';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { BEARER_AUTH } from '../../docs/swagger';
import {
  DeviceView,
  DevicesService,
  EnrolledDeviceView,
  IssuedEnrollmentView,
} from './devices.service';
import {
  DeviceViewDto,
  EnrolledDeviceViewDto,
  IssuedEnrollmentViewDto,
} from './dto/device-response.dto';
import { IssueEnrollmentDto } from './dto/issue-enrollment.dto';
import { RedeemEnrollmentDto } from './dto/redeem-enrollment.dto';

@ApiTags('devices')
@Controller('devices')
export class DevicesController {
  constructor(private readonly devicesService: DevicesService) {}

  @ApiOperation({
    summary: 'Issue a one-time enrollment code',
    description:
      'Owners only — not platform administrators. Returns the code **once**; it is stored as a hash and never echoed back afterwards.\n\nThe owner names the **branch** the phone will belong to, and what the handset should be called. A device belongs to a branch rather than to a person (see PROGRESS.md §2a), so anyone assigned to that branch signs in on it afterwards with their own password. A branch in another tenant answers **404**, and no token is written.',
  })
  @ApiBearerAuth(BEARER_AUTH)
  @ApiCreatedResponse({ type: IssuedEnrollmentViewDto })
  @ApiNotFoundResponse({
    type: ErrorResponseDto,
    description: 'No such branch in the caller’s business — the same answer another tenant’s branch gives.',
  })
  @SkipThrottle({ auth: true })
  @Roles(UserRole.OWNER)
  @Post('enrollments')
  issueEnrollment(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: IssueEnrollmentDto,
  ): Promise<IssuedEnrollmentView> {
    return this.devicesService.issueEnrollment(user, dto);
  }

  /**
   * Called by a phone that has no credentials yet, so it is public — and
   * therefore in the strict auth rate-limit bucket, since an open endpoint
   * that accepts a secret is exactly what gets guessed at.
   */
  @ApiOperation({
    summary: 'Redeem an enrollment code',
    description:
      'Public: the phone has no credentials yet. Mints the `device_id` server-side and binds the installation to one business and one **branch**. An unknown, spent, expired, or suspended-shop code all answer **401** identically, so a phone cannot probe which codes exist. Subject to the strict auth rate-limit bucket.',
  })
  @ApiOkResponse({ type: EnrolledDeviceViewDto })
  @ApiUnauthorizedResponse({
    type: ErrorResponseDto,
    description: 'Unknown, already used, or expired code — indistinguishable by design.',
  })
  @ApiTooManyRequestsResponse({
    type: ErrorResponseDto,
    description: 'Strict auth rate-limit bucket exceeded.',
  })
  @Public()
  @Throttle({ auth: {} })
  @Post('enroll')
  @HttpCode(HttpStatus.OK)
  redeemEnrollment(@Body() dto: RedeemEnrollmentDto): Promise<EnrolledDeviceView> {
    return this.devicesService.redeemEnrollment(dto);
  }

  @ApiOperation({
    summary: 'List devices',
    description:
      'Owners see every device in their own business. Managers see only the devices in the branches they are assigned to.',
  })
  @ApiBearerAuth(BEARER_AUTH)
  @ApiOkResponse({ type: [DeviceViewDto] })
  @SkipThrottle({ auth: true })
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  @Get()
  list(@CurrentUser() user: AuthenticatedUser): Promise<DeviceView[]> {
    return this.devicesService.listForPrincipal(user);
  }

  @ApiOperation({
    summary: 'One device',
    description:
      'A device in another tenant answers **404, not 403**. A manager asking about a device outside their branches gets the same 404.',
  })
  @ApiBearerAuth(BEARER_AUTH)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: DeviceViewDto })
  @ApiNotFoundResponse({
    type: ErrorResponseDto,
    description: 'No such device in the caller’s business.',
  })
  @SkipThrottle({ auth: true })
  @Roles(UserRole.OWNER, UserRole.MANAGER)
  @Get(':id')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<DeviceView> {
    return this.devicesService.findOne(user, id);
  }

  @ApiOperation({
    summary: 'Revoke a device',
    description:
      'Owners only. The phone is refused by the backend on its very next request — an existing session token stops working immediately, it is not merely hidden in the app. A revoked handset will not even say who works at its branch.',
  })
  @ApiBearerAuth(BEARER_AUTH)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: DeviceViewDto })
  @ApiNotFoundResponse({
    type: ErrorResponseDto,
    description: 'No such device in the caller’s business.',
  })
  @ApiConflictResponse({
    type: ErrorResponseDto,
    description: 'That device is already revoked.',
  })
  @SkipThrottle({ auth: true })
  @Roles(UserRole.OWNER)
  @Post(':id/revoke')
  @HttpCode(HttpStatus.OK)
  revoke(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<DeviceView> {
    return this.devicesService.revoke(user, id);
  }
}
