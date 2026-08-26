import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches } from 'class-validator';

/**
 * Which day a report covers.
 *
 * A **local** calendar date in the shop's own zone, never an instant and never
 * an offset. The backend turns it into a pair of UTC instants using
 * `Business.timezone` and its own clock — see `src/domain/day-window.ts` — and
 * nothing a client sends can move that boundary.
 *
 * Omitting it means **today**, which is likewise decided by the server. A
 * phone or a browser with the wrong local time cannot ask for "today" and be
 * given yesterday's takings, because it is not the one deciding.
 */
export class DailyReportQueryDto {
  @ApiPropertyOptional({
    example: '2026-08-21',
    pattern: '^\\d{4}-\\d{2}-\\d{2}$',
    description:
      'The shop-local calendar day, as `YYYY-MM-DD`. Omit it for today, decided by the **server** clock in the shop’s own time zone. A date that no calendar has — `2026-02-30` — is refused with a **400** rather than quietly rolled into the next month.',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'date must be written as YYYY-MM-DD',
  })
  date?: string;
}
