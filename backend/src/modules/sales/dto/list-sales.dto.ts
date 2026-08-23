import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export const SALES_PAGE_DEFAULT = 50;
export const SALES_PAGE_MAX = 100;

/**
 * Paging for the owner's sales list.
 *
 * Keyset, not offset. A shop keeps selling while somebody reads page two, and
 * an offset would quietly show them a row they had already seen or skip one
 * they had not.
 */
export class ListSalesDto {
  @ApiPropertyOptional({
    minimum: 1,
    maximum: SALES_PAGE_MAX,
    default: SALES_PAGE_DEFAULT,
    description: 'How many sales to return, newest first.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(SALES_PAGE_MAX)
  limit?: number;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'The `nextCursor` from the previous page. Omit it for the first page. A cursor from another branch or another tenant answers **404**, like anything else that is not the caller’s.',
  })
  @IsOptional()
  @IsUUID()
  cursor?: string;
}
