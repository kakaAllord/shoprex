import { ApiProperty } from '@nestjs/swagger';
import { PaymentMethodKind } from '@prisma/client';
import type { SaleLineView, SalePaymentView, SaleView } from '../sales.service';

export class SaleLineViewDto implements SaleLineView {
  @ApiProperty({ format: 'uuid' })
  productId!: string;

  @ApiProperty({ format: 'uuid' })
  productUnitId!: string;

  @ApiProperty({
    example: 'Coca-Cola 500ml',
    description: 'Snapshotted. Renaming the product later does not rewrite this receipt.',
  })
  productName!: string;

  @ApiProperty({ example: 'Carton' })
  unitName!: string;

  @ApiProperty({ example: 2 })
  quantity!: number;

  @ApiProperty({
    example: 12000,
    description:
      'Snapshotted, in whole shillings. Doc 02 §6: a later price change must never rewrite a completed sale.',
  })
  unitPriceTzs!: number;

  @ApiProperty({ example: 24000, description: 'quantity × unitPriceTzs, and nothing else.' })
  lineTotalTzs!: number;

  @ApiProperty({
    example: 6,
    description: 'What one of that unit was worth in base units when this was sold.',
  })
  conversionFactor!: number;

  @ApiProperty({ example: 12, description: 'The stock this line removed, in base units.' })
  normalizedQuantity!: number;

  @ApiProperty({
    example: 0,
    description:
      'How much of this line the branch had **not** recorded, in base units. Zero on an ordinary sale. Above zero means the count was already wrong before this sale — the seller was holding the item, so the shop had it — and the branch balance has gone negative by this much. The sale is never refused for this; an audit entry records it for the owner to recount.',
  })
  shortfallNormalized!: number;
}

export class SalePaymentViewDto implements SalePaymentView {
  @ApiProperty({ format: 'uuid' })
  paymentMethodId!: string;

  @ApiProperty({
    example: 'Taslimu',
    description: 'Snapshotted, so renaming or removing a method never rewrites a receipt.',
  })
  methodName!: string;

  @ApiProperty({ enum: PaymentMethodKind })
  methodKind!: PaymentMethodKind;

  @ApiProperty({ example: 24000, description: 'How much of the bill this payment settled.' })
  amountTzs!: number;

  @ApiProperty({
    nullable: true,
    type: Number,
    example: 25000,
    description: 'Cash only: what the customer handed over. Null when the money was exact.',
  })
  cashReceivedTzs!: number | null;

  @ApiProperty({
    nullable: true,
    type: Number,
    example: 1000,
    description: 'cashReceivedTzs minus amountTzs, calculated by the backend.',
  })
  changeTzs!: number | null;

  @ApiProperty({
    nullable: true,
    type: String,
    example: 'Mama Asha',
    description:
      'Debt only. A name written down — V1 creates no customer account, history, or collection workflow from it.',
  })
  debtorName!: string | null;
}

/** The receipt: everything the customer was shown, kept as it was shown. */
export class SaleViewDto implements SaleView {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  branchId!: string;

  @ApiProperty({ format: 'uuid' })
  soldById!: string;

  @ApiProperty({ example: 'Juma Hassan' })
  soldByName!: string;

  @ApiProperty({
    nullable: true,
    type: String,
    format: 'uuid',
    description: 'The phone it was rung up on. Null when an owner sells from the web.',
  })
  deviceId!: string | null;

  @ApiProperty({ example: 24000 })
  totalTzs!: number;

  @ApiProperty({ example: 1000, description: 'Cash handed back across the whole sale.' })
  changeTzs!: number;

  @ApiProperty({ example: 0, description: 'What walked out unpaid, against a name.' })
  debtTzs!: number;

  @ApiProperty({ type: [SaleLineViewDto] })
  lines!: SaleLineViewDto[];

  @ApiProperty({ type: [SalePaymentViewDto] })
  payments!: SalePaymentViewDto[];

  @ApiProperty({
    example: false,
    description:
      'True when at least one line took more than the branch had recorded. The sale completed regardless — this is a flag for the owner to recount, not something the seller did wrong.',
  })
  hasStockInconsistency!: boolean;

  @ApiProperty({
    format: 'date-time',
    description:
      'Set by the backend server clock, never by the device. A phone with the wrong local time must not decide which day a sale is reported under.',
  })
  createdAt!: Date;
}
