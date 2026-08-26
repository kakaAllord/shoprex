import { Controller, Get, Header, Param, ParseUUIDPipe, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { UserPermission, UserRole } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { ErrorResponseDto } from '../../common/dto/error-response.dto';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { BEARER_AUTH } from '../../docs/swagger';
import { dailyReportFilename, renderDailyReportPdf } from './daily-report.pdf';
import { DailyReportQueryDto } from './dto/daily-report.query.dto';
import { BranchComparisonViewDto, DailyReportViewDto } from './dto/report-response.dto';
import { BranchComparisonView, DailyReportView, ReportsService } from './reports.service';

/**
 * The day, read back.
 *
 * Reports need `VIEW_REPORTS` — the same permission the sales list needs, and
 * for the same reason: browsing what the shop has taken is a management act
 * rather than part of selling. The owner always has it.
 *
 * The branch-scoped routes hang off `branches/:branchId` like stock and sales,
 * so the branch never appears in a query the caller could tamper with, and so
 * a branch in another tenant answers **404** through the same one helper.
 */
@ApiTags('reports')
@ApiBearerAuth(BEARER_AUTH)
@SkipThrottle({ auth: true })
@Roles(UserRole.OWNER, UserRole.MANAGER, UserRole.WORKER)
@RequirePermissions(UserPermission.VIEW_REPORTS)
@Controller()
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @ApiOperation({
    summary: 'The day’s report for one branch',
    description:
      'Needs `VIEW_REPORTS`; the owner always may. Everything an owner asks of a day: what was sold, how it was paid, what is owed and against whose name, who sold it, what arrived on the shelf, and the transactions themselves.\n\n**The day is the shop’s, not the server’s and not the phone’s.** `date` is a local calendar day in the business’s own time zone; the backend turns it into a pair of UTC instants and returns them in `window`, so a reader can check exactly which instants were counted rather than taking “Tuesday” on trust. Omit `date` for today, which the **server** clock decides.\n\nEvery figure is computed from the values the sale itself snapshotted — `methodName`, `productName`, `unitPriceTzs` — and never by joining back to the live payment method or price, so a report of last month reads with last month’s names and prices.\n\nThe PDF at `daily.pdf` is rendered from **this same response**, which is what makes the two agree by construction.',
  })
  @ApiParam({ name: 'branchId', format: 'uuid' })
  @ApiOkResponse({ type: DailyReportViewDto })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description:
      '`date` is not `YYYY-MM-DD`, or is a date no calendar has such as `2026-02-30`. It is refused rather than quietly rolled into the next month.',
  })
  @ApiForbiddenResponse({
    type: ErrorResponseDto,
    description: 'The caller does not hold `VIEW_REPORTS`.',
  })
  @ApiNotFoundResponse({
    type: ErrorResponseDto,
    description:
      'No such branch for this caller — the answer for another tenant’s branch and for one the caller is not assigned to alike.',
  })
  @Get('branches/:branchId/reports/daily')
  daily(
    @CurrentUser() user: AuthenticatedUser,
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @Query() query: DailyReportQueryDto,
  ): Promise<DailyReportView> {
    return this.reports.daily(user, branchId, query.date);
  }

  @ApiOperation({
    summary: 'The day’s report for one branch, as a PDF',
    description:
      'The very same report as the route above, laid out for printing or sending on. It is rendered **from that response object**, not recomputed, so the two cannot disagree — which is Phase 7’s acceptance check.\n\nThe file is named after the branch and the shop-local day, so a folder of them sorts into date order.',
  })
  @ApiParam({ name: 'branchId', format: 'uuid' })
  @ApiProduces('application/pdf')
  @ApiOkResponse({
    description: 'The daily report as a PDF document.',
    schema: { type: 'string', format: 'binary' },
  })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'A `date` that is not a real calendar day.' })
  @ApiForbiddenResponse({ type: ErrorResponseDto, description: 'The caller does not hold `VIEW_REPORTS`.' })
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: 'No such branch for this caller.' })
  @Header('Content-Type', 'application/pdf')
  @Get('branches/:branchId/reports/daily.pdf')
  async dailyPdf(
    @CurrentUser() user: AuthenticatedUser,
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @Query() query: DailyReportQueryDto,
    @Res() response: Response,
  ): Promise<void> {
    const report = await this.reports.daily(user, branchId, query.date);
    const pdf = renderDailyReportPdf(report);

    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${dailyReportFilename(report)}"`,
    );
    response.setHeader('Content-Length', pdf.length);
    response.end(pdf);
  }

  @ApiOperation({
    summary: 'One day across every branch the caller may see',
    description:
      'The owner’s branch comparison, over the same shop-local day as the report above and resolved by the same code.\n\nScoped rather than owner-only, like `GET /branches` and `GET /devices`: an owner sees every branch of their business, a manager sees only the branches they were assigned, and a manager over one branch sees a table of one — which is simply the truth. A branch that answers `404` on the single-branch report can never appear as a row here.',
  })
  @ApiOkResponse({ type: BranchComparisonViewDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'A `date` that is not a real calendar day.' })
  @ApiForbiddenResponse({
    type: ErrorResponseDto,
    description:
      'The caller does not hold `VIEW_REPORTS`, or is a platform administrator, who acts on a business through the platform endpoints rather than this one.',
  })
  @Get('reports/branches')
  branchComparison(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: DailyReportQueryDto,
  ): Promise<BranchComparisonView> {
    return this.reports.branchComparison(user, query.date);
  }
}
