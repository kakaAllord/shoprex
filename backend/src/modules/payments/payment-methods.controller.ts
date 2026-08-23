import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { BEARER_AUTH } from '../../docs/swagger';
import { PaymentMethodViewDto } from './dto/payment-method-response.dto';
import { PaymentMethodView, PaymentMethodsService } from './payment-methods.service';

@ApiTags('payments')
@ApiBearerAuth(BEARER_AUTH)
@SkipThrottle({ auth: true })
@Roles(UserRole.OWNER, UserRole.MANAGER, UserRole.WORKER)
@Controller('payment-methods')
export class PaymentMethodsController {
  constructor(private readonly paymentMethods: PaymentMethodsService) {}

  @ApiOperation({
    summary: 'Payment methods this shop accepts',
    description:
      'The buttons on the checkout sheet, in the order they should appear. Only **active** methods are returned: deactivating `Deni` is how an owner stops their shop selling on credit, and a phone holding a stale list cannot override that — the sale command refuses an inactive method too.\n\nEvery business is created with a small default set (Taslimu, Pesa ya simu, Deni). Editing them belongs to the Phase 6 settings screen, so this route is read-only.',
  })
  @ApiOkResponse({ type: [PaymentMethodViewDto] })
  @Get()
  list(@CurrentUser() user: AuthenticatedUser): Promise<PaymentMethodView[]> {
    return this.paymentMethods.listActive(user);
  }
}
