import { ApiProperty } from '@nestjs/swagger';
import { PaymentMethodKind } from '@prisma/client';
import type { PaymentMethodView } from '../payment-methods.service';

export class PaymentMethodViewDto implements PaymentMethodView {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Taslimu', description: 'What the shop calls it.' })
  name!: string;

  @ApiProperty({
    enum: PaymentMethodKind,
    description:
      'What kind of settlement this is, whatever the shop named it. The kind drives the arithmetic: only `CASH` accepts `cashReceivedTzs` and gives change, and only `DEBT` accepts a `debtorName`.',
  })
  kind!: PaymentMethodKind;

  @ApiProperty({ example: true })
  isActive!: boolean;

  @ApiProperty({ example: 0, description: 'The order the payment sheet shows them in.' })
  sortOrder!: number;
}
