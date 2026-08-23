import { Injectable } from '@nestjs/common';
import { AuditAction, Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

export interface AuditActor {
  userId: string | null;
  role: UserRole | null;
  /** Present when the action arrived from an enrolled device. */
  deviceId: string | null;
}

export interface AuditEntry {
  businessId: string;
  branchId?: string | null;
  action: AuditAction;
  targetType?: string | null;
  targetId?: string | null;
  /** A short line the owner can read. Must never contain a secret. */
  summary: string;
}

export interface AuditEventView {
  id: string;
  action: AuditAction;
  summary: string;
  branchId: string | null;
  actorUserId: string | null;
  actorName: string | null;
  actorRole: UserRole | null;
  deviceId: string | null;
  targetType: string | null;
  targetId: string | null;
  createdAt: Date;
}

/** Everything a caller may pass to narrow the log. Never a business id. */
export interface AuditQuery {
  limit: number;
  deviceId?: string;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Appends one attribution record. `createdAt` comes from the database
   * default — the backend clock — so no caller can influence when an action
   * appears to have happened.
   *
   * Accepts an optional transaction client so an action and its audit record
   * commit or roll back together: an audit line for a device that was never
   * created would be worse than no line at all.
   */
  async record(
    actor: AuditActor,
    entry: AuditEntry,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const client = tx ?? this.prisma;

    await client.auditEvent.create({
      data: {
        businessId: entry.businessId,
        branchId: entry.branchId ?? null,
        actorUserId: actor.userId,
        actorRole: actor.role,
        deviceId: actor.deviceId,
        action: entry.action,
        targetType: entry.targetType ?? null,
        targetId: entry.targetId ?? null,
        summary: entry.summary,
      },
    });
  }

  /**
   * The owner's view of who did what. Scoped to the caller's own business by
   * the businessId argument, which always comes from the verified token.
   */
  async listForBusiness(businessId: string, query: AuditQuery): Promise<AuditEventView[]> {
    const events = await this.prisma.auditEvent.findMany({
      where: {
        businessId,
        ...(query.deviceId ? { deviceId: query.deviceId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: query.limit,
      include: { actor: { select: { fullName: true } } },
    });

    return events.map((event) => ({
      id: event.id,
      action: event.action,
      summary: event.summary,
      branchId: event.branchId,
      actorUserId: event.actorUserId,
      actorName: event.actor?.fullName ?? null,
      actorRole: event.actorRole,
      deviceId: event.deviceId,
      targetType: event.targetType,
      targetId: event.targetId,
      createdAt: event.createdAt,
    }));
  }
}
