import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

/**
 * The one query the payment-method list takes.
 *
 * Checkout wants the active methods and nothing else — a phone must not be
 * able to see, let alone offer, a method the owner switched off. The settings
 * screen wants all of them, because a switched-off method it cannot see is one
 * it cannot switch back on. So the flag exists, and it is owners only.
 */
export class ListPaymentMethodsDto {
  @ApiPropertyOptional({
    example: true,
    description:
      'Owners only. Include the methods that are switched off, so the settings screen can show them and turn them back on. Anyone else asking is refused **403** rather than quietly given the active list — a client that thinks it is seeing everything and is not would be worse than an error.',
  })
  @IsOptional()
  @Transform(({ value }) => (value === 'true' || value === true ? true : value === 'false' || value === false ? false : value))
  @IsBoolean()
  includeInactive?: boolean;
}
