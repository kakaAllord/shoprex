import { ApiProperty } from '@nestjs/swagger';
import type {
  ProductStockView,
  StockReceiptView,
  StockUnitView,
} from '../stock.service';

export class StockUnitViewDto implements StockUnitView {
  @ApiProperty({ format: 'uuid' })
  unitId!: string;

  @ApiProperty({ example: 'Carton' })
  unitName!: string;

  @ApiProperty({ example: 5 })
  quantity!: number;

  @ApiProperty({ example: 6, description: 'Base units inside one of these.' })
  factorToBase!: number;
}

export class ProductStockViewDto implements ProductStockView {
  @ApiProperty({ format: 'uuid' })
  productId!: string;

  @ApiProperty({ example: 'Coca-Cola 500ml' })
  productName!: string;

  @ApiProperty({ format: 'uuid' })
  branchId!: string;

  @ApiProperty({
    type: [StockUnitViewDto],
    description:
      'The physical package state, largest packaging first — `5 Cartons + 5 Pieces`. Units the branch holds none of are left out rather than shown as zero. The engine never rolls these up: six loose Pieces do not become a Carton, because nobody taped a box around them.',
  })
  packages!: StockUnitViewDto[];

  @ApiProperty({
    example: 35,
    description:
      'The same holding as one number in base units, for arithmetic and reconciliation. Shop screens should show `packages`.',
  })
  normalizedQuantity!: number;

  @ApiProperty({ format: 'uuid' })
  baseUnitId!: string;

  @ApiProperty({ example: 'Piece' })
  baseUnitName!: string;
}

export class StockReceiptLineViewDto {
  @ApiProperty({ format: 'uuid' })
  productId!: string;

  @ApiProperty({ example: 'Coca-Cola 500ml' })
  productName!: string;

  @ApiProperty({ format: 'uuid' })
  unitId!: string;

  @ApiProperty({ example: 'Carton' })
  unitName!: string;

  @ApiProperty({ example: 6 })
  quantity!: number;

  @ApiProperty({
    example: 36,
    description:
      'Snapshotted at the time. A later change to the package factor must never rewrite what this delivery contained.',
  })
  normalizedQuantity!: number;

  @ApiProperty({ nullable: true, type: Number, example: 5400 })
  unitCostTzs!: number | null;
}

export class StockReceiptViewDto implements StockReceiptView {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  branchId!: string;

  @ApiProperty({ format: 'uuid' })
  receivedById!: string;

  @ApiProperty({ example: 'Juma Hassan' })
  receivedByName!: string;

  @ApiProperty({
    nullable: true,
    type: String,
    format: 'uuid',
    description: 'The phone it was recorded on, when it was recorded on one.',
  })
  deviceId!: string | null;

  @ApiProperty({ nullable: true, type: String, example: 'Mzigo wa Jumatatu' })
  note!: string | null;

  @ApiProperty({ type: [StockReceiptLineViewDto] })
  lines!: StockReceiptLineViewDto[];

  @ApiProperty({
    format: 'date-time',
    description: 'Set by the backend server clock, never by the device.',
  })
  createdAt!: Date;
}
