import { ApiProperty } from '@nestjs/swagger';
import type { ProductUnitView, ProductView } from '../products.service';

export class ProductUnitViewDto implements ProductUnitView {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Carton' })
  name!: string;

  @ApiProperty({
    nullable: true,
    type: Number,
    example: 6000,
    description:
      'Whole Tanzanian shillings, one price per unit across the whole business. Null until the shop has priced this packaging.',
  })
  priceTzs!: number | null;

  @ApiProperty({
    example: 6,
    description:
      'How many base units one of these contains — 6 for a Carton of 6 Pieces. This is what the engine does arithmetic in.',
  })
  factorToBase!: number;

  @ApiProperty({
    example: false,
    description: 'The smallest unit of this product, the one everything normalises to.',
  })
  isBaseUnit!: boolean;

  @ApiProperty({ type: [String], example: ['5901234123457'] })
  barcodes!: string[];
}

export class UnitRelationshipViewDto {
  @ApiProperty({ format: 'uuid' })
  parentUnitId!: string;

  @ApiProperty({ format: 'uuid' })
  childUnitId!: string;

  @ApiProperty({ example: 6, description: 'One parent contains this many children.' })
  factor!: number;
}

export class ProductViewDto implements ProductView {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Coca-Cola 500ml' })
  name!: string;

  @ApiProperty({ example: true })
  isActive!: boolean;

  @ApiProperty({ type: [ProductUnitViewDto], description: 'Largest packaging first.' })
  units!: ProductUnitViewDto[];

  @ApiProperty({ type: [UnitRelationshipViewDto] })
  relationships!: UnitRelationshipViewDto[];

  @ApiProperty({ format: 'uuid', description: 'The smallest unit of this product.' })
  baseUnitId!: string;

  @ApiProperty({ type: [String] })
  barcodes!: string[];

  @ApiProperty({ format: 'date-time', description: 'Backend server clock.' })
  createdAt!: Date;
}
