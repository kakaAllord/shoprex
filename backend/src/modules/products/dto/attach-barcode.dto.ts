import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID } from 'class-validator';

/**
 * Attaching a barcode to a product that already exists — deferred from Phase 3
 * (§3 known issue 2), where a code could only be supplied at creation or when
 * a unit was added.
 */
export class AttachBarcodeDto {
  @ApiProperty({
    example: '5901234123457',
    description:
      'EAN-13. A 12-digit UPC-A is accepted and widened to its EAN-13 form. The check digit is verified, so a mis-scan is refused rather than stored as a code the real item can never match again.',
  })
  @IsString()
  barcode!: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Which packaging the code is printed on, when it is not the product generally — a Carton often carries its own. Must be a unit of this product.',
  })
  @IsOptional()
  @IsUUID()
  productUnitId?: string;
}
