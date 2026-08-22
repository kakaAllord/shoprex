import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { BranchesService, BranchView } from './branches.service';
import { CreateBranchDto } from './dto/create-branch.dto';

@SkipThrottle({ auth: true })
@Controller('branches')
export class BranchesController {
  constructor(private readonly branchesService: BranchesService) {}

  /** Only the owner creates branches in V1; delegation arrives in Phase 2. */
  @Roles(UserRole.OWNER)
  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateBranchDto,
  ): Promise<BranchView> {
    return this.branchesService.create(user, dto);
  }

  @Roles(UserRole.OWNER, UserRole.MANAGER, UserRole.WORKER)
  @Get()
  list(@CurrentUser() user: AuthenticatedUser): Promise<BranchView[]> {
    return this.branchesService.listForPrincipal(user);
  }

  @Roles(UserRole.OWNER, UserRole.MANAGER, UserRole.WORKER)
  @Get(':id')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<BranchView> {
    return this.branchesService.findOne(user, id);
  }
}