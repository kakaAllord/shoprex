import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Owner-only product management, deferred from Phase 3 (§3 known issue 3).
 *
 * Both fields are optional and at least one must be present — a PATCH that
 * says nothing is a mistake worth reporting, not a no-op worth pretending
 * succeeded.
 */
export class UpdateProductDto {
  @ApiPropertyOptional({ example: 'Coca-Cola 500ml', minLength: 1, maxLength: 160 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name?: string;

  @ApiPropertyOptional({
    example: false,
    description:
      'False discontinues the item: it leaves the search suggestions, and it can no longer be sold or received. It is **not** deleted and its history is untouched — every past sale still reads the way it did. Scanning its barcode still finds it, so the person holding the phone is told it was discontinued rather than that the code is unknown.',
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
