import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';

export const SERIES_DAYS_DEFAULT = 14;
export const SERIES_DAYS_MAX = 90;

/**
 * How much of the recent past the takings chart covers.
 *
 * `date` is the **last** day of the run and follows exactly the same rule as
 * the daily report's: a shop-local calendar day, resolved by the backend from
 * `Business.timezone` and the server clock, and omitted means today.
 *
 * `days` is capped because this is a chart, not an export. Ninety points is
 * already more than a line drawn a few hundred pixels wide can show
 * honestly, and an uncapped range is an invitation to pull a shop's entire
 * trading history over a phone connection to draw a sparkline.
 */
export class SeriesQueryDto {
  @ApiPropertyOptional({
    example: '2026-08-21',
    pattern: '^\\d{4}-\\d{2}-\\d{2}$',
    description:
      'The **last** shop-local day of the run, as `YYYY-MM-DD`. Omit it for today, decided by the server clock in the shop’s own time zone.',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must be written as YYYY-MM-DD' })
  date?: string;

  @ApiPropertyOptional({
    example: 14,
    minimum: 1,
    maximum: SERIES_DAYS_MAX,
    default: SERIES_DAYS_DEFAULT,
    description: `How many days the run covers, ending on \`date\`. Between 1 and ${SERIES_DAYS_MAX}; defaults to ${SERIES_DAYS_DEFAULT}.`,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(SERIES_DAYS_MAX)
  days?: number;
}
