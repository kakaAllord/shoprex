import { Body, Controller, Get, Post } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { BusinessDetail, BusinessesService, BusinessSummary } from './businesses.service';
import { CreateBusinessDto } from './dto/create-business.dto';

@SkipThrottle({ auth: true })
@Controller('businesses')
export class BusinessesController {
  constructor(private readonly businessesService: BusinessesService) {}

  /** Platform administrators only: onboard a shop and its owner. */
  @Roles(UserRole.PLATFORM_ADMIN)
  @Post()
  create(@Body() dto: CreateBusinessDto): Promise<BusinessDetail> {
    return this.businessesService.createWithOwner(dto);
  }

  @Roles(UserRole.PLATFORM_ADMIN)
  @Get()
  list(): Promise<BusinessSummary[]> {
    return this.businessesService.listAll();
  }

  /** The caller's own business. Owners and managers never pass an id. */
  @Roles(UserRole.OWNER, UserRole.MANAGER, UserRole.WORKER)
  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser): Promise<BusinessDetail> {
    return this.businessesService.forPrincipal(user);
  }
}