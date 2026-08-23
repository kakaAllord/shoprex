import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
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
import { UserPermission, UserRole } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { ErrorResponseDto } from '../../common/dto/error-response.dto';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { BEARER_AUTH } from '../../docs/swagger';
import { CreateSaleDto } from './dto/create-sale.dto';
import { SaleViewDto } from './dto/sale-response.dto';
import { SaleView, SalesService } from './sales.service';

/**
 * The branch is a path segment, not a body field — a sale belongs to a branch,
 * the way stock does, and keeping it in the URL is what stops request bodies
 * from growing the ability to name a tenant's internals.
 */
@ApiTags('sales')
@ApiBearerAuth(BEARER_AUTH)
@SkipThrottle({ auth: true })
@Roles(UserRole.OWNER, UserRole.MANAGER, UserRole.WORKER)
@Controller('branches/:branchId/sales')
export class SalesController {
  constructor(private readonly sales: SalesService) {}

  @ApiOperation({
    summary: 'Complete a sale',
    description:
      'Needs `SELL`; the owner always may. One command and one transaction: the sale, its lines, the payment settlement, the payment records, and the stock movements either all happen or none do.\n\n**Idempotent.** A repeated `idempotencyKey` returns the sale the first attempt created rather than ringing it up twice — including when two identical requests race each other.\n\nEvery line snapshots the product name, unit name, price, conversion factor, and normalized quantity, so a later price change or repackaging can never rewrite a completed sale.',
  })
  @ApiParam({ name: 'branchId', format: 'uuid' })
  @ApiCreatedResponse({ type: SaleViewDto })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description:
      'The payments do not settle the total exactly, a debt carries no debtor name, a unit has no price yet, or the same product and unit appears on two lines.',
  })
  @ApiNotFoundResponse({
    type: ErrorResponseDto,
    description:
      'The branch is not one the caller may sell from, a product or unit is not in this business, or the payment method is unknown or switched off.',
  })
  @ApiConflictResponse({
    type: ErrorResponseDto,
    description:
      'The branch does not hold enough stock — in which case nothing at all is written — or the idempotency key was already used for a sale in another branch.',
  })
  @RequirePermissions(UserPermission.SELL)
  @Post()
  complete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @Body() dto: CreateSaleDto,
  ): Promise<SaleView> {
    return this.sales.complete(user, branchId, dto);
  }

  @ApiOperation({
    summary: 'One sale, as a receipt',
    description:
      'What the customer was shown, kept as it was shown. A sale in another tenant — or in a branch this caller is not assigned to — answers **404, not 403**.\n\nThe sales *list* is deliberately absent: the owner-facing sales list and detail screen belong to Phase 6, and the selling flow only needs the receipt for the sale just rung up.',
  })
  @ApiParam({ name: 'branchId', format: 'uuid' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: SaleViewDto })
  @ApiNotFoundResponse({
    type: ErrorResponseDto,
    description: 'No such sale in a branch this caller may read.',
  })
  @Get(':id')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SaleView> {
    return this.sales.findOne(user, branchId, id);
  }
}
