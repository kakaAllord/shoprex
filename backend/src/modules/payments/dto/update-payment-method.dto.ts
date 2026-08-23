import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';

/**
 * Renaming, reordering, or switching a payment method off.
 *
 * There is no `kind` here and no delete. `kind` drives the arithmetic and is
 * fixed at creation; deleting is impossible without taking a receipt's meaning
 * with it, since `SalePayment.paymentMethod` is `onDelete: Restrict`.
 * Deactivating is also the honest verb — the shop stopped accepting it, it did
 * not stop having accepted it.
 */
export class UpdatePaymentMethodDto {
  @ApiPropertyOptional({ example: 'M-Pesa', minLength: 1, maxLength: 40 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  name?: string;

  @ApiPropertyOptional({
    example: false,
    description:
      'False takes it off the checkout sheet. This is how an owner stops their shop selling on credit: deactivate `Deni`, and the backend refuses a debt settlement from a phone still holding the old list — not merely the button.',
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    example: 1,
    minimum: 0,
    description: 'Where it sits on the payment sheet, lowest first.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
