import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
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
import { BusinessDetail, BusinessesService, BusinessSummary } from './businesses.service';
import { BusinessDetailDto, BusinessSummaryDto } from './dto/business-response.dto';
import { CreateBusinessDto } from './dto/create-business.dto';
import { UpdateBusinessStatusDto } from './dto/update-business-status.dto';

@ApiTags('businesses')
@ApiBearerAuth(BEARER_AUTH)
@SkipThrottle({ auth: true })
@Controller('businesses')
export class BusinessesController {
  constructor(private readonly businessesService: BusinessesService) {}

  /** Platform administrators only: onboard a shop and its owner. */
  @ApiOperation({
    summary: 'Onboard a shop and its owner',
    description:
      'Platform administrators only. Kept alongside owner self-registration for admin-led onboarding.',
  })
  @ApiCreatedResponse({ type: BusinessDetailDto })
  @ApiForbiddenResponse({
    type: ErrorResponseDto,
    description: 'The caller is not a platform administrator.',
  })
  @ApiConflictResponse({
    type: ErrorResponseDto,
    description: 'That owner email address is already registered.',
  })
  @Roles(UserRole.PLATFORM_ADMIN)
  @Post()
  create(@Body() dto: CreateBusinessDto): Promise<BusinessDetail> {
    return this.businessesService.createWithOwner(dto);
  }

  @ApiOperation({
    summary: 'Every shop on the platform',
    description: 'Platform administrators only. An owner calling this receives 403.',
  })
  @ApiOkResponse({ type: [BusinessSummaryDto] })
  @ApiForbiddenResponse({
    type: ErrorResponseDto,
    description: 'The caller is not a platform administrator.',
  })
  @Roles(UserRole.PLATFORM_ADMIN)
  @Get()
  list(): Promise<BusinessSummary[]> {
    return this.businessesService.listAll();
  }

  @ApiOperation({
    summary: 'Suspend or restore a shop account',
    description:
      'Platform administrators only. Suspending a shop locks it immediately in every direction at once: nobody in it can sign in, no phone can redeem an enrollment code, and every session token already in circulation is refused on its very next request — an account that is suspended everywhere except in the sessions already open is not suspended.\n\n**Nothing is deleted.** Products, stock, sales, and history stay exactly as they are, and restoring the account brings the shop back whole. That is what makes it safe to do.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: BusinessDetailDto })
  @ApiForbiddenResponse({
    type: ErrorResponseDto,
    description: 'The caller is not a platform administrator.',
  })
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: 'No such shop account.' })
  @ApiConflictResponse({
    type: ErrorResponseDto,
    description:
      'That shop is already in the state asked for. Said rather than silently succeeded, so an administrator knows whether they just suspended it or somebody else already had.',
  })
  @Roles(UserRole.PLATFORM_ADMIN)
  @Patch(':id')
  setActive(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBusinessStatusDto,
  ): Promise<BusinessDetail> {
    return this.businessesService.setActive(id, dto.isActive);
  }

  /** The caller's own business. Owners and managers never pass an id. */
  @ApiOperation({
    summary: 'The caller’s own business',
    description:
      'Scoped entirely by the bearer token — there is deliberately no id parameter, so there is nothing for a caller to tamper with.',
  })
  @ApiOkResponse({ type: BusinessDetailDto })
  @ApiForbiddenResponse({
    type: ErrorResponseDto,
    description: 'A platform administrator has no own business; they use the platform endpoints.',
  })
  @Roles(UserRole.OWNER, UserRole.MANAGER, UserRole.WORKER)
  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser): Promise<BusinessDetail> {
    return this.businessesService.forPrincipal(user);
  }
}
