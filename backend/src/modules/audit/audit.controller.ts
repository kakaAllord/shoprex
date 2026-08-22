import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { ErrorResponseDto } from '../../common/dto/error-response.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { BEARER_AUTH } from '../../docs/swagger';
import { AuditEventView, AuditService } from './audit.service';
import { AuditEventViewDto } from './dto/audit-response.dto';
import { ListAuditEventsDto } from './dto/list-audit-events.dto';
import { requireBusiness } from '../../common/tenancy';

@ApiTags('audit')
@ApiBearerAuth(BEARER_AUTH)
@SkipThrottle({ auth: true })
@Controller('audit-events')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @ApiOperation({
    summary: 'Who did what',
    description:
      'The owner’s attribution log for their own business, most recent first. Every entry names the actor and, when the action came from an enrolled device, that device. Timestamps are the backend server clock.',
  })
  @ApiOkResponse({ type: [AuditEventViewDto] })
  @ApiForbiddenResponse({
    type: ErrorResponseDto,
    description: 'Only the owner of the business reads its audit log in V1.',
  })
  @Roles(UserRole.OWNER)
  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListAuditEventsDto,
  ): Promise<AuditEventView[]> {
    return this.auditService.listForBusiness(requireBusiness(user), query);
  }
}
