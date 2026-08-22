import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import {
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
import { BranchesService, BranchView } from './branches.service';
import { BranchViewDto } from './dto/branch-response.dto';
import { CreateBranchDto } from './dto/create-branch.dto';

@ApiTags('branches')
@ApiBearerAuth(BEARER_AUTH)
@SkipThrottle({ auth: true })
@Controller('branches')
export class BranchesController {
  constructor(private readonly branchesService: BranchesService) {}

  /** Only the owner creates branches in V1; delegation arrives in Phase 2. */
  @ApiOperation({
    summary: 'Add a branch',
    description:
      'Owners only in V1. The branch is created in the caller’s own business — the tenant comes from the token, never from the body.',
  })
  @ApiCreatedResponse({ type: BranchViewDto })
  @ApiConflictResponse({
    type: ErrorResponseDto,
    description:
      'A branch with that name already exists in this business. Names are unique per business, so a different business may reuse the same name.',
  })
  @Roles(UserRole.OWNER)
  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateBranchDto,
  ): Promise<BranchView> {
    return this.branchesService.create(user, dto);
  }

  @ApiOperation({
    summary: 'List branches',
    description:
      'Owners see every branch of their own business. Managers and workers see only the branches they are assigned to.',
  })
  @ApiOkResponse({ type: [BranchViewDto] })
  @Roles(UserRole.OWNER, UserRole.MANAGER, UserRole.WORKER)
  @Get()
  list(@CurrentUser() user: AuthenticatedUser): Promise<BranchView[]> {
    return this.branchesService.listForPrincipal(user);
  }

  @ApiOperation({
    summary: 'One branch',
    description:
      'A branch in another tenant answers **404, not 403** — a caller must not learn that a branch id exists in someone else’s business. A manager or worker not assigned to the branch gets the same 404.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: BranchViewDto })
  @ApiNotFoundResponse({
    type: ErrorResponseDto,
    description:
      'No such branch in the caller’s business — also the answer for another tenant’s branch, and for an unassigned manager or worker.',
  })
  @Roles(UserRole.OWNER, UserRole.MANAGER, UserRole.WORKER)
  @Get(':id')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<BranchView> {
    return this.branchesService.findOne(user, id);
  }
}
