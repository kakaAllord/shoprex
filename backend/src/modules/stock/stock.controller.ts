import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
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
import { UserPermission, UserRole } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { ErrorResponseDto } from '../../common/dto/error-response.dto';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { BEARER_AUTH } from '../../docs/swagger';
import { CreateStockReceiptDto } from './dto/create-stock-receipt.dto';
import { ProductStockViewDto, StockReceiptViewDto } from './dto/stock-response.dto';
import { ProductStockView, StockReceiptView, StockService } from './stock.service';

/**
 * Stock hangs off a branch in the URL because that is what it belongs to —
 * doc 02 §2 — and because it keeps the branch out of request bodies.
 */
@ApiTags('stock')
@ApiBearerAuth(BEARER_AUTH)
@SkipThrottle({ auth: true })
@Roles(UserRole.OWNER, UserRole.MANAGER, UserRole.WORKER)
@ApiParam({ name: 'branchId', format: 'uuid' })
@Controller('branches/:branchId')
export class StockController {
  constructor(private readonly stockService: StockService) {}

  @ApiOperation({
    summary: 'Receive stock',
    description:
      'Needs `RECEIVE_STOCK`; the owner always may. Records a delivery into this branch, in the packaging it arrived in — six Cartons stay six Cartons rather than becoming thirty-six Pieces.\n\nThe whole delivery is one transaction: a receipt that fails on its third line leaves none of it in stock. The timestamp is the backend server clock.',
  })
  @ApiCreatedResponse({ type: StockReceiptViewDto })
  @ApiForbiddenResponse({
    type: ErrorResponseDto,
    description: 'The caller does not hold `RECEIVE_STOCK`.',
  })
  @ApiNotFoundResponse({
    type: ErrorResponseDto,
    description:
      'No such branch for this caller — the answer for another tenant’s branch, and for one the caller is not assigned to. Also the answer for an unknown product or a unit that is not that product’s.',
  })
  @RequirePermissions(UserPermission.RECEIVE_STOCK)
  @Post('stock-receipts')
  receive(
    @CurrentUser() user: AuthenticatedUser,
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @Body() dto: CreateStockReceiptDto,
  ): Promise<StockReceiptView> {
    return this.stockService.receiveStock(user, branchId, dto);
  }

  @ApiOperation({
    summary: 'Current stock in a branch',
    description:
      'Needs `VIEW_STOCK`; the owner always may. Returns the physical package state a shopkeeper would recite — `5 Cartons + 5 Pieces` — alongside the normalized quantity the engine reckons in. Products the branch holds none of are omitted.',
  })
  @ApiOkResponse({ type: [ProductStockViewDto] })
  @ApiForbiddenResponse({
    type: ErrorResponseDto,
    description: 'The caller does not hold `VIEW_STOCK`.',
  })
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: 'No such branch for this caller.' })
  @RequirePermissions(UserPermission.VIEW_STOCK)
  @Get('stock')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('branchId', ParseUUIDPipe) branchId: string,
  ): Promise<ProductStockView[]> {
    return this.stockService.listForBranch(user, branchId);
  }

  @ApiOperation({
    summary: 'One product’s stock in a branch',
    description:
      'Needs `VIEW_STOCK`; the owner always may. Unlike the list, this answers for a product the branch holds none of, with an empty `packages` and a `normalizedQuantity` of 0 — "we have none" is a real answer on a selling screen.',
  })
  @ApiParam({ name: 'productId', format: 'uuid' })
  @ApiOkResponse({ type: ProductStockViewDto })
  @ApiConflictResponse({
    type: ErrorResponseDto,
    description: 'Reserved for stock operations that cannot be satisfied.',
  })
  @ApiNotFoundResponse({
    type: ErrorResponseDto,
    description: 'No such branch for this caller, or no such product in their business.',
  })
  @RequirePermissions(UserPermission.VIEW_STOCK)
  @Get('stock/:productId')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @Param('productId', ParseUUIDPipe) productId: string,
  ): Promise<ProductStockView> {
    return this.stockService.findForProduct(user, branchId, productId);
  }
}
