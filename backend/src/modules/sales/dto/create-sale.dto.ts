import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class SaleLineDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  productId!: string;

  @ApiProperty({
    format: 'uuid',
    description:
      'The commercial unit actually sold. `2 Cartons` and `5 Pieces` of the same product are two lines, not one — that is what went over the counter, and the receipt has to say so.',
  })
  @IsUUID()
  productUnitId!: string;

  @ApiProperty({ example: 2, minimum: 1, description: 'In the unit named above.' })
  @IsInt()
  @Min(1)
  quantity!: number;
}

export class SalePaymentDto {
  @ApiProperty({
    format: 'uuid',
    description: 'One of the active methods from `GET /payment-methods`.',
  })
  @IsUUID()
  paymentMethodId!: string;

  @ApiProperty({
    example: 7500,
    minimum: 1,
    description:
      'How much of the bill this payment settles, in whole shillings. Across all payments these must add up to the sale total **exactly**.',
  })
  @IsInt()
  @Min(1)
  amountTzs!: number;

  @ApiPropertyOptional({
    example: 10000,
    minimum: 0,
    description:
      'Cash only: what the customer physically handed over. The change is calculated from it and never comes from the client. Omit it when the money was exact.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  cashReceivedTzs?: number;

  @ApiPropertyOptional({
    example: 'Mama Asha',
    maxLength: 120,
    description:
      'Debt only, and required for it: the one thing a debt sale records. V1 creates no customer account, no history, and no collection workflow from this name.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  debtorName?: string;
}

/**
 * The branch is in the URL, not here — a sale belongs to a branch, and both the
 * tenant and the branch are checked against the caller before anything is
 * written. The tenant is never in a request body at all.
 */
export class CreateSaleDto {
  @ApiProperty({
    example: 'a3f1c2de-0f4b-4a91-9f2e-7c1d5b3e9a01:17',
    minLength: 8,
    maxLength: 100,
    description:
      'Unique per business. A retried request carrying a key that has already been used returns the sale the first attempt created, rather than ringing it up twice. Required: a network that drops the response is the normal case on a Tanzanian phone, not the exception.',
  })
  @IsString()
  @Length(8, 100)
  idempotencyKey!: string;

  @ApiProperty({ type: [SaleLineDto], description: 'At least one line.' })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => SaleLineDto)
  lines!: SaleLineDto[];

  @ApiProperty({
    type: [SalePaymentDto],
    description:
      'At least one. Several means a mixed payment, and they must settle the total exactly.',
  })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => SalePaymentDto)
  payments!: SalePaymentDto[];
}
