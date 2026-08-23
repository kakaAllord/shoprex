import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
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
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { BEARER_AUTH } from '../../docs/swagger';
import { AddProductUnitDto } from './dto/add-product-unit.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { ProductViewDto } from './dto/product-response.dto';
import { LookupBarcodeDto, SearchProductsDto } from './dto/search-products.dto';
import { PRODUCT_WRITE_PERMISSIONS, ProductView, ProductsService } from './products.service';

@ApiTags('products')
@ApiBearerAuth(BEARER_AUTH)
@SkipThrottle({ auth: true })
@Roles(UserRole.OWNER, UserRole.MANAGER, UserRole.WORKER)
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @ApiOperation({
    summary: 'Add a product',
    description:
      'Needs `SELL` or `RECEIVE_STOCK`; the owner always may. Deliberately reachable by a worker, because an unknown item has to be addable in the middle of a sale.\n\nThe minimum is a name and one unit. A price, a barcode, and the relationship to a smaller unit can all arrive later — Shoprex must not force catalogue setup before a shop can sell.',
  })
  @ApiCreatedResponse({ type: ProductViewDto })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description:
      'A cyclic or disconnected unit graph, a unit given two parents, a factor that contradicts a fixed measurement conversion, or a barcode that fails its check digit.',
  })
  @ApiConflictResponse({
    type: ErrorResponseDto,
    description: 'That product name, or that barcode, is already used in this business.',
  })
  @RequirePermissions(...PRODUCT_WRITE_PERMISSIONS)
  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateProductDto,
  ): Promise<ProductView> {
    return this.productsService.create(user, dto);
  }

  @ApiOperation({
    summary: 'Search products',
    description:
      'Manual search suggestions for the selling screen. Matches anywhere in the name and ignores case. Omit `query` to list the catalogue.',
  })
  @ApiOkResponse({ type: [ProductViewDto] })
  @Get()
  search(
    @CurrentUser() user: AuthenticatedUser,
    @Query() dto: SearchProductsDto,
  ): Promise<ProductView[]> {
    return this.productsService.search(user, dto);
  }

  @ApiOperation({
    summary: 'Look a product up by barcode',
    description:
      'The fast path on the selling screen. Accepts EAN-13, and a UPC-A widened to one. A code that could not be a barcode answers **400**; a valid code with no product answers **404** — a mis-scan and an unknown item are different problems for the person holding the phone.',
  })
  @ApiOkResponse({ type: ProductViewDto })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: 'Not a valid EAN-13 — wrong length, non-digits, or a bad check digit.',
  })
  @ApiNotFoundResponse({
    type: ErrorResponseDto,
    description: 'A valid barcode, but no product in this business carries it.',
  })
  @Get('lookup')
  lookup(
    @CurrentUser() user: AuthenticatedUser,
    @Query() dto: LookupBarcodeDto,
  ): Promise<ProductView> {
    return this.productsService.findByBarcode(user, dto.barcode);
  }

  @ApiOperation({
    summary: 'One product',
    description:
      'A product in another tenant answers **404, not 403** — a caller must not learn that a product id exists in someone else’s business.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: ProductViewDto })
  @ApiNotFoundResponse({
    type: ErrorResponseDto,
    description: 'No such product in the caller’s business.',
  })
  @Get(':id')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ProductView> {
    return this.productsService.findOne(user, id);
  }

  @ApiOperation({
    summary: 'Add a unit to a product',
    description:
      'Progressive enrichment: the shop that only sold Cartons has just sold a Piece, so now it says what a Piece is. The new unit must connect to one that already exists, so the product keeps exactly one smallest unit doing the arithmetic.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiCreatedResponse({ type: ProductViewDto })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description:
      'The relationship would create a cycle, give a unit two parents, or contradict a fixed measurement conversion.',
  })
  @ApiNotFoundResponse({
    type: ErrorResponseDto,
    description: 'No such product in the caller’s business, or `relatedUnitId` is not its unit.',
  })
  @ApiConflictResponse({
    type: ErrorResponseDto,
    description: 'That product already has a unit with that name, or the barcode is taken.',
  })
  @RequirePermissions(...PRODUCT_WRITE_PERMISSIONS)
  @Post(':id/units')
  addUnit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddProductUnitDto,
  ): Promise<ProductView> {
    return this.productsService.addUnit(user, id, dto);
  }
}
