import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMethodKind } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';

/**
 * A shop adding a way of being paid — M-Pesa, Airtel Money, a bank, a till.
 *
 * `kind` is chosen once and never edited afterwards, because the kind is not a
 * label: it decides the arithmetic. Only `CASH` accepts an amount tendered and
 * gives change back, and only `DEBT` carries a debtor name. A shop that wants
 * a different kind adds a different method rather than reinterpreting the
 * receipts that already settled against this one.
 */
export class CreatePaymentMethodDto {
  @ApiProperty({
    example: 'M-Pesa',
    minLength: 1,
    maxLength: 40,
    description: 'What the shop calls it. Unique within the business.',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  name!: string;

  @ApiProperty({
    enum: PaymentMethodKind,
    example: PaymentMethodKind.MOBILE_MONEY,
    description:
      'What kind of settlement this is, whatever the shop named it. **Fixed at creation.** Only `CASH` accepts `cashReceivedTzs` and gives change; only `DEBT` accepts a `debtorName`.',
  })
  @IsEnum(PaymentMethodKind)
  kind!: PaymentMethodKind;

  @ApiPropertyOptional({
    example: 3,
    minimum: 0,
    description:
      'Where it sits on the payment sheet. Defaults to the end of the list, which is where a shop’s fourth method belongs until they say otherwise.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
