import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';

/**
 * Editing one packaging of a product — the price edit Phase 3 deferred here.
 *
 * There is deliberately no `isActive` and no way to unset a price. Switching a
 * single packaging off needs rules nobody has written: the base unit cannot go
 * without taking the arithmetic with it, and the branch holds physical stock
 * per unit. Discontinuing the whole product is the supported verb, and it is
 * on `PATCH /products/{id}`.
 */
export class UpdateProductUnitDto {
  @ApiPropertyOptional({ example: 'Kreti', minLength: 1, maxLength: 40 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  name?: string;

  @ApiPropertyOptional({
    example: 7000,
    minimum: 0,
    description:
      'Whole Tanzanian shillings, one price per unit across the business. Changing it changes what the shop charges from now on and **never** what a completed sale says: every sale line snapshotted its own price when it was rung up.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  priceTzs?: number;
}
