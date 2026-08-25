import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class StockReceiptLineDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  productId!: string;

  @ApiProperty({
    format: 'uuid',
    description:
      'The packaging it arrived in. Six Cartons are recorded as six Cartons, not as thirty-six Pieces, because that is what is on the floor.',
  })
  @IsUUID()
  productUnitId!: string;

  @ApiProperty({ example: 6, minimum: 1, description: 'In the unit named above.' })
  @IsInt()
  @Min(1)
  quantity!: number;

  @ApiPropertyOptional({
    example: 5400,
    minimum: 0,
    description:
      'What one of that unit cost, in whole Tanzanian shillings. Optional — a shop may record what arrived without recording what it paid. V1 does no profit accounting with it.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  unitCostTzs?: number;
}

/**
 * The branch is in the URL, not here: stock belongs to a branch, and the tenant
 * and branch are both checked against the caller before anything is written.
 */
export class CreateStockReceiptDto {
  @ApiProperty({ type: [StockReceiptLineDto], description: 'At least one line.' })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => StockReceiptLineDto)
  lines!: StockReceiptLineDto[];

  @ApiPropertyOptional({
    example: 'Mzigo wa Jumatatu · Monday delivery',
    maxLength: 240,
  })
  @IsOptional()
  @IsString()
  @MaxLength(240)
  note?: string;

  @ApiPropertyOptional({
    example: 'device-7f3a:1756100000000:4',
    maxLength: 200,
    description:
      'Unique within the business. Send the same key when retrying a delivery whose response never arrived, and the backend returns the receipt the first attempt created rather than putting the same crate into stock twice. Optional so a client written before Phase 8 still works; the Android app always sends one.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  idempotencyKey?: string;
}
