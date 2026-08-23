import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class SearchProductsDto {
  @ApiPropertyOptional({
    example: 'coke',
    description:
      'Matches anywhere in the name and ignores case, because a seller types "coke" for "Coca-Cola 500ml". Omit it to list the catalogue.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  query?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 50, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit: number = 20;
}

export class LookupBarcodeDto {
  @ApiPropertyOptional({
    example: '5901234123457',
    description:
      'EAN-13, or a UPC-A which is widened to one. A code that cannot be a barcode answers **400**, not 404, so a mis-scan is reported as a mis-scan rather than as an unknown product.',
  })
  @IsString()
  @MaxLength(32)
  barcode!: string;
}
