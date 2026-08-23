import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AuditAction, PaymentMethodKind, Prisma, UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { requireBusiness } from '../../common/tenancy';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { actorFrom } from '../users/users.service';
import { CreatePaymentMethodDto } from './dto/create-payment-method.dto';
import { ListPaymentMethodsDto } from './dto/list-payment-methods.dto';
import { UpdatePaymentMethodDto } from './dto/update-payment-method.dto';

export interface PaymentMethodView {
  id: string;
  name: string;
  kind: PaymentMethodKind;
  isActive: boolean;
  sortOrder: number;
}

@Injectable()
export class PaymentMethodsService {
  private readonly logger = new Logger(PaymentMethodsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * The methods this shop accepts, in the order the payment sheet shows them.
   *
   * Read-only in Phase 4 on purpose: the checkout screen needs to know what
   * the buttons are, and the settings screen that edits them is Phase 6's
   * deliverable. Building a write endpoint here would duplicate that work and
   * invite the two to drift.
   */
  async listActive(
    principal: AuthenticatedUser,
    query: ListPaymentMethodsDto = {},
  ): Promise<PaymentMethodView[]> {
    const businessId = requireBusiness(principal);

    // The settings screen has to see what it may switch back on. Nobody else
    // does, and a phone must never be handed a method the owner switched off:
    // it would render a button the backend then refuses, which reads to the
    // seller as Shoprex being broken rather than as the shop's own rule.
    if (query.includeInactive && principal.role !== UserRole.OWNER) {
      throw new ForbiddenException(
        'Ni mmiliki pekee anayeona njia zilizozimwa · Only the owner sees switched-off payment methods',
      );
    }

    return this.prisma.paymentMethod.findMany({
      where: { businessId, ...(query.includeInactive ? {} : { isActive: true }) },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, kind: true, isActive: true, sortOrder: true },
    });
  }

  /**
   * A shop adding a way of being paid. Owners only.
   *
   * `sortOrder` defaults to the end of the list rather than to zero: a shop's
   * fourth method belongs after the three it already had until somebody says
   * otherwise, and defaulting to zero would silently push it in front of cash.
   */
  async create(
    principal: AuthenticatedUser,
    dto: CreatePaymentMethodDto,
  ): Promise<PaymentMethodView> {
    const businessId = requireBusiness(principal);
    const name = dto.name.trim();

    await this.assertNameFree(businessId, name, null);

    const sortOrder = dto.sortOrder ?? (await this.nextSortOrder(businessId));

    const created = await this.prisma.$transaction(async (tx) => {
      const method = await tx.paymentMethod.create({
        data: { businessId, name, kind: dto.kind, sortOrder },
        select: { id: true, name: true, kind: true, isActive: true, sortOrder: true },
      });

      await this.audit.record(
        actorFrom(principal),
        {
          businessId,
          action: AuditAction.PAYMENT_METHOD_CREATED,
          targetType: 'PaymentMethod',
          targetId: method.id,
          summary: `Njia ya malipo ${method.name} imeongezwa · Payment method ${method.name} added`,
        },
        tx,
      );

      return method;
    });

    this.logger.log(`Payment method created: ${created.id} in business ${businessId}`);

    return created;
  }

  /**
   * Renaming, reordering, or switching a method off. Owners only.
   *
   * Nothing here is a delete, and there is deliberately no delete route.
   * `SalePayment.paymentMethod` is `onDelete: Restrict`, so removing a method
   * that has settled anything would either fail or take a receipt's meaning
   * with it. Deactivating is also the truthful verb: the shop stopped
   * accepting it, it did not stop having accepted it.
   *
   * The name is snapshotted onto every payment at the moment it settles, so
   * renaming `Deni` tomorrow does not rewrite what last week's receipts say.
   */
  async update(
    principal: AuthenticatedUser,
    methodId: string,
    dto: UpdatePaymentMethodDto,
  ): Promise<PaymentMethodView> {
    const businessId = requireBusiness(principal);

    const existing = await this.prisma.paymentMethod.findFirst({
      where: { id: methodId, businessId },
      select: { id: true, name: true, kind: true, isActive: true, sortOrder: true },
    });

    // Another tenant's method answers 404, never 403 - the same rule every
    // other resource follows.
    if (!existing) {
      throw new NotFoundException('Payment method not found');
    }

    const name = dto.name?.trim();

    if (name === undefined && dto.isActive === undefined && dto.sortOrder === undefined) {
      throw new BadRequestException(
        'Nothing to change - supply a name, isActive, sortOrder, or any combination',
      );
    }

    if (name !== undefined && name.toLowerCase() !== existing.name.toLowerCase()) {
      await this.assertNameFree(businessId, name, existing.id);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const method = await tx.paymentMethod.update({
        where: { id: existing.id },
        data: {
          ...(name === undefined ? {} : { name }),
          ...(dto.isActive === undefined ? {} : { isActive: dto.isActive }),
          ...(dto.sortOrder === undefined ? {} : { sortOrder: dto.sortOrder }),
        },
        select: { id: true, name: true, kind: true, isActive: true, sortOrder: true },
      });

      await this.audit.record(
        actorFrom(principal),
        {
          businessId,
          action: AuditAction.PAYMENT_METHOD_UPDATED,
          targetType: 'PaymentMethod',
          targetId: method.id,
          summary: describeMethodUpdate(existing, method),
        },
        tx,
      );

      return method;
    });

    return updated;
  }

  private async assertNameFree(
    businessId: string,
    name: string,
    exceptId: string | null,
  ): Promise<void> {
    const clash = await this.prisma.paymentMethod.findFirst({
      where: {
        businessId,
        name: { equals: name, mode: 'insensitive' },
        ...(exceptId ? { NOT: { id: exceptId } } : {}),
      },
      select: { id: true },
    });

    if (clash) {
      throw new ConflictException(
        'Njia ya malipo yenye jina hilo ipo tayari · A payment method with that name already exists',
      );
    }
  }

  private async nextSortOrder(businessId: string): Promise<number> {
    const last = await this.prisma.paymentMethod.findFirst({
      where: { businessId },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });

    return last ? last.sortOrder + 1 : 0;
  }

  /**
   * The methods a set of ids refers to, checked against the caller's own
   * business and against being switched off.
   *
   * A method id is client-supplied, so it gets the same treatment as any other
   * client-supplied id: an id from another tenant simply is not found, and a
   * deactivated one is not found either — an owner who turned `Deni` off has
   * said their shop does not sell on credit, and a phone that still has the
   * old button must not be able to override that.
   */
  async resolveActive(
    tx: Prisma.TransactionClient,
    businessId: string,
    ids: readonly string[],
  ): Promise<Map<string, PaymentMethodView>> {
    const methods = await tx.paymentMethod.findMany({
      where: { businessId, isActive: true, id: { in: [...ids] } },
      select: { id: true, name: true, kind: true, isActive: true, sortOrder: true },
    });

    return new Map(methods.map((method) => [method.id, method]));
  }
}

/**
 * One audit line for a payment-method edit, naming only what actually moved.
 * "Deni: imezimwa" is what an owner wants to find months later; a line that
 * merely says the row was updated is one they have to go and interpret.
 */
function describeMethodUpdate(
  before: PaymentMethodView,
  after: PaymentMethodView,
): string {
  const parts: string[] = [];

  if (before.name !== after.name) {
    parts.push(`jina: ${before.name} → ${after.name}`);
  }

  if (before.isActive !== after.isActive) {
    parts.push(after.isActive ? 'imewashwa · switched on' : 'imezimwa · switched off');
  }

  if (before.sortOrder !== after.sortOrder) {
    parts.push(`mpangilio: ${before.sortOrder} → ${after.sortOrder}`);
  }

  return `${after.name}${parts.length > 0 ? ` (${parts.join(', ')})` : ' (hakuna mabadiliko)'}`;
}
