import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

/**
 * The everyday events a busy shop produces by the hundred. They are not noise —
 * they are the shop working — but a log they dominate is a log nobody scans,
 * and the reason an owner opens this page is to find the *unusual* thing.
 */
export const ROUTINE_ACTIONS = [
  'SALE_COMPLETED',
  'STOCK_RECEIVED',
  'DEVICE_SIGNED_IN',
] as const;

export type AuditScope = 'all' | 'notable';

export class ListAuditEventsDto {
  @ApiPropertyOptional({
    minimum: 1,
    maximum: 200,
    default: 50,
    description: 'How many of the most recent events to return.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit: number = 50;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Narrow the log to one device. A device belonging to another business simply matches nothing — the tenant still comes from the token.',
  })
  @IsOptional()
  @IsUUID()
  deviceId?: string;

  @ApiPropertyOptional({
    enum: ['all', 'notable'],
    default: 'all',
    description:
      '`notable` leaves out the events a working shop produces by the hundred — completed sales, received deliveries, and device sign-ins — so that a price change, a revoked phone, or a short count is findable rather than buried. `all` is everything, and is the default because an API that silently omits records is worse than one that makes you ask.',
  })
  @IsOptional()
  @IsIn(['all', 'notable'])
  scope: AuditScope = 'all';
}
