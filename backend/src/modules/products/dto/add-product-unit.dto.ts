import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/**
 * Progressive enrichment: the shop that only sold Cartons has just sold a
 * Piece, so now it must say what a Piece is.
 */
export class AddProductUnitDto {
  @ApiProperty({ example: 'Piece', minLength: 1, maxLength: 40 })
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  name!: string;

  @ApiPropertyOptional({ example: 1000, minimum: 0, description: 'Whole Tanzanian shillings.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  priceTzs?: number;

  @ApiProperty({
    format: 'uuid',
    description:
      'The unit this new one nests with. It must already belong to this product — the new unit has to connect to the others so the product keeps one smallest unit doing the arithmetic.',
  })
  @IsUUID()
  relatedUnitId!: string;

  @ApiProperty({
    enum: ['RELATED', 'NEW'],
    description:
      'Which of the two is the larger. `RELATED` means the **new** unit contains the related one (1 new = factor × related). `NEW` means the related unit contains the new one (1 related = factor × new) — that is the usual case when adding a Piece under an existing Carton.',
    example: 'NEW',
  })
  @IsIn(['RELATED', 'NEW'])
  contains!: 'RELATED' | 'NEW';

  @ApiProperty({
    example: 6,
    minimum: 1,
    description: 'How many of the smaller unit are inside one of the larger.',
  })
  @IsInt()
  @Min(1)
  factor!: number;

  @ApiPropertyOptional({
    example: '5901234123457',
    description: 'EAN-13 printed on this particular packaging, if it has its own.',
  })
  @IsOptional()
  @IsString()
  barcode?: string;
}
