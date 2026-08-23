import { Injectable } from '@nestjs/common';
import { PaymentMethodKind, Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { requireBusiness } from '../../common/tenancy';
import { PrismaService } from '../../database/prisma.service';

export interface PaymentMethodView {
  id: string;
  name: string;
  kind: PaymentMethodKind;
  isActive: boolean;
  sortOrder: number;
}

@Injectable()
export class PaymentMethodsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The methods this shop accepts, in the order the payment sheet shows them.
   *
   * Read-only in Phase 4 on purpose: the checkout screen needs to know what
   * the buttons are, and the settings screen that edits them is Phase 6's
   * deliverable. Building a write endpoint here would duplicate that work and
   * invite the two to drift.
   */
  async listActive(principal: AuthenticatedUser): Promise<PaymentMethodView[]> {
    const businessId = requireBusiness(principal);

    return this.prisma.paymentMethod.findMany({
      where: { businessId, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, kind: true, isActive: true, sortOrder: true },
    });
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
