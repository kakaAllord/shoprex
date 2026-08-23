import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { ErrorResponseDto } from '../../common/dto/error-response.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { BEARER_AUTH } from '../../docs/swagger';
import { CreatePaymentMethodDto } from './dto/create-payment-method.dto';
import { ListPaymentMethodsDto } from './dto/list-payment-methods.dto';
import { PaymentMethodViewDto } from './dto/payment-method-response.dto';
import { UpdatePaymentMethodDto } from './dto/update-payment-method.dto';
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
      'The buttons on the checkout sheet, in the order they should appear. Only **active** methods are returned by default: deactivating `Deni` is how an owner stops their shop selling on credit, and a phone holding a stale list cannot override that — the sale command refuses an inactive method too.\n\nEvery business is created with a small default set (Taslimu, Pesa ya simu, Deni), which the owner then renames, adds to, or switches off. Pass `includeInactive=true` — owners only — to get the switched-off ones as well, which is what the settings screen needs in order to switch them back on.',
  })
  @ApiOkResponse({ type: [PaymentMethodViewDto] })
  @ApiForbiddenResponse({
    type: ErrorResponseDto,
    description: 'Somebody other than the owner asked for `includeInactive`.',
  })
  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListPaymentMethodsDto,
  ): Promise<PaymentMethodView[]> {
    return this.paymentMethods.listActive(user, query);
  }

  @ApiOperation({
    summary: 'Add a payment method',
    description:
      'Owners only — how a shop is paid is a business-wide decision. `kind` is chosen here and never edited afterwards, because it is not a label: only `CASH` accepts an amount tendered and gives change, and only `DEBT` carries a debtor name. A shop wanting a different kind adds a different method rather than reinterpreting the receipts that already settled against this one.\n\nIt lands at the end of the payment sheet unless `sortOrder` says otherwise.',
  })
  @ApiCreatedResponse({ type: PaymentMethodViewDto })
  @ApiForbiddenResponse({
    type: ErrorResponseDto,
    description: 'The caller is not the owner of this business.',
  })
  @ApiConflictResponse({
    type: ErrorResponseDto,
    description: 'This business already has a payment method with that name.',
  })
  @Roles(UserRole.OWNER)
  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreatePaymentMethodDto,
  ): Promise<PaymentMethodView> {
    return this.paymentMethods.create(user, dto);
  }

  @ApiOperation({
    summary: 'Rename, reorder, or switch off a payment method',
    description:
      'Owners only. Switching `Deni` off is how an owner says their shop does not sell on credit — and it is enforced at the backend, so a phone still holding the old list is refused rather than merely missing a button.\n\n**There is deliberately no delete.** `SalePayment.paymentMethod` is `onDelete: Restrict`, so removing a method that has settled anything would take a receipt’s meaning with it. Deactivating is also the honest verb: the shop stopped accepting it, it did not stop having accepted it.\n\nRenaming is safe for the same reason a price edit is: every payment snapshots the method name at the moment it settles, so renaming today never rewrites last week’s receipts. `kind` cannot be changed at all.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: PaymentMethodViewDto })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: 'None of `name`, `isActive`, or `sortOrder` was supplied.',
  })
  @ApiForbiddenResponse({
    type: ErrorResponseDto,
    description: 'The caller is not the owner of this business.',
  })
  @ApiNotFoundResponse({
    type: ErrorResponseDto,
    description:
      'No such payment method in the caller’s business — also the answer for another tenant’s method, which is **404, not 403**.',
  })
  @ApiConflictResponse({
    type: ErrorResponseDto,
    description: 'Another method in this business already has that name.',
  })
  @Roles(UserRole.OWNER)
  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePaymentMethodDto,
  ): Promise<PaymentMethodView> {
    return this.paymentMethods.update(user, id, dto);
  }
}
