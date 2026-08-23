import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class ProductUnitInputDto {
  @ApiProperty({
    example: 'Carton',
    description: 'Piece, Carton, Sack, kg, or a custom name such as Fungu.',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  name!: string;

  @ApiPropertyOptional({
    example: 6000,
    minimum: 0,
    description:
      'Whole Tanzanian shillings. Omit it when the shop has not priced this packaging yet — a product created mid-sale can be priced a moment later.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  priceTzs?: number;
}

export class UnitRelationshipInputDto {
  @ApiProperty({
    example: 'Carton',
    description: 'The larger unit, named as it appears in `units`.',
  })
  @IsString()
  parentUnit!: string;

  @ApiProperty({ example: 'Piece', description: 'The unit inside it.' })
  @IsString()
  childUnit!: string;

  @ApiProperty({
    example: 6,
    minimum: 1,
    description:
      'How many child units are inside one parent. This belongs to **this product** — a Carton is 6 Pieces here and may be 48 elsewhere. A fixed measurement conversion (1 kg = 1000 g) cannot be contradicted.',
  })
  @IsInt()
  @Min(1)
  factor!: number;
}

export class CreateProductDto {
  @ApiProperty({ example: 'Coca-Cola 500ml', minLength: 1, maxLength: 160 })
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name!: string;

  @ApiProperty({
    type: [ProductUnitInputDto],
    description:
      'At least one. A shop that only sells by Carton supplies only Carton, and is never asked what a Piece is until it sells one.',
  })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => ProductUnitInputDto)
  units!: ProductUnitInputDto[];

  @ApiPropertyOptional({
    type: [UnitRelationshipInputDto],
    description:
      'How the units nest. Omit it when there is only one unit. Every unit must end up connected, and cycles are refused.',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UnitRelationshipInputDto)
  relationships?: UnitRelationshipInputDto[];

  @ApiPropertyOptional({
    example: '5901234123457',
    description:
      'EAN-13. A 12-digit UPC-A is accepted and widened to its EAN-13 form. The check digit is verified, so a mis-scan is refused rather than stored.',
  })
  @IsOptional()
  @IsString()
  barcode?: string;

  @ApiPropertyOptional({
    example: 'Carton',
    description:
      'Which packaging the barcode is printed on, if it is not the product generally. A Carton often carries its own code.',
  })
  @IsOptional()
  @IsString()
  barcodeUnit?: string;
}
