import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
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
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { BEARER_AUTH } from '../../docs/swagger';
import { AddProductUnitDto } from './dto/add-product-unit.dto';
import { AttachBarcodeDto } from './dto/attach-barcode.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { ProductViewDto } from './dto/product-response.dto';
import { LookupBarcodeDto, SearchProductsDto } from './dto/search-products.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { UpdateProductUnitDto } from './dto/update-product-unit.dto';
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
    summary: 'Unit names this shop already uses',
    description:
      'Most-used first. Feeds the unit picker when a product is added mid-sale, so a seller chooses `Kipande` from a list rather than spelling it at a counter — a shop that writes one unit three different ways ends up with three units that mean the same thing. The client merges this with a small set of common Swahili names, so a shop on its first day still has something to choose from.',
  })
  @ApiOkResponse({ type: [String] })
  @Get('unit-names')
  unitNames(@CurrentUser() user: AuthenticatedUser): Promise<string[]> {
    return this.productsService.unitNames(user);
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
    summary: 'Rename or discontinue a product',
    description:
      'Owners only, and deferred here from Phase 3 on purpose: what the shop carries is a business-wide decision, while a seller who needs an unknown item on the shelf already has `POST /products`.\n\nDiscontinuing **does not delete**. The item leaves the search suggestions and can no longer be sold or received, its history is untouched, and scanning its barcode still finds it so the person holding the phone is told it was discontinued rather than that the code is unknown.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: ProductViewDto })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: 'Neither `name` nor `isActive` was supplied — there is nothing to change.',
  })
  @ApiNotFoundResponse({
    type: ErrorResponseDto,
    description: 'No such product in the caller’s business.',
  })
  @ApiConflictResponse({
    type: ErrorResponseDto,
    description: 'Another product in this business already has that name.',
  })
  @Roles(UserRole.OWNER)
  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
  ): Promise<ProductView> {
    return this.productsService.update(user, id, dto);
  }

  @ApiOperation({
    summary: 'Reprice or rename one packaging',
    description:
      'Owners only — the price edit Phase 3 deferred to this console. One price per unit across the business.\n\nChanging it changes what the shop charges from now on and **never** what a completed sale says: every sale line snapshotted its own price when it was rung up (doc 02 §6). The change is recorded in the audit log with the old price as well as the new one, because "why is a crate 7,000 now?" is asked weeks later and the sale lines cannot answer it.\n\nThere is deliberately no way to switch a single packaging off or to unset a price: the base unit cannot go without taking the arithmetic with it. Discontinuing the whole product is the supported verb.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiParam({ name: 'unitId', format: 'uuid' })
  @ApiOkResponse({ type: ProductViewDto })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: 'Neither `name` nor `priceTzs` was supplied — there is nothing to change.',
  })
  @ApiNotFoundResponse({
    type: ErrorResponseDto,
    description: 'No such product in the caller’s business, or that unit is not its unit.',
  })
  @ApiConflictResponse({
    type: ErrorResponseDto,
    description: 'That product already has another unit with that name.',
  })
  @Roles(UserRole.OWNER)
  @Patch(':id/units/:unitId')
  updateUnit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('unitId', ParseUUIDPipe) unitId: string,
    @Body() dto: UpdateProductUnitDto,
  ): Promise<ProductView> {
    return this.productsService.updateUnit(user, id, unitId, dto);
  }

  @ApiOperation({
    summary: 'Attach a barcode to an existing product',
    description:
      'Owners only. Phase 3 could put a code on a product at creation or on a unit as it was added, but a product typed in without one had no way to acquire it later — and a shop that spent its first busy week adding items by name has a drawer full of exactly that problem.\n\nBarcodes stay unique **per tenant**, not globally: two shops may stock the same item, so the clash that matters is one inside this business.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiCreatedResponse({ type: ProductViewDto })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: 'Not a valid EAN-13 — wrong length, non-digits, or a bad check digit.',
  })
  @ApiNotFoundResponse({
    type: ErrorResponseDto,
    description: 'No such product in the caller’s business, or that unit is not its unit.',
  })
  @ApiConflictResponse({
    type: ErrorResponseDto,
    description: 'That barcode already belongs to another product in this business.',
  })
  @Roles(UserRole.OWNER)
  @Post(':id/barcodes')
  attachBarcode(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AttachBarcodeDto,
  ): Promise<ProductView> {
    return this.productsService.attachBarcode(user, id, dto);
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
