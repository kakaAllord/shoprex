import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { DeviceStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import type { AuthenticatedUser } from '../decorators/current-user.decorator';

/**
 * Stops a revoked phone at the backend.
 *
 * A device token is valid for hours, so revocation cannot wait for it to
 * expire: an owner revoking a stolen handset expects it dead on its very next
 * request. That means one lookup per device-authenticated request — a cost
 * paid only by device sessions, since owners and managers carry no `deviceId`
 * claim and skip this entirely.
 *
 * Deliberately at the backend and not in the app. Hiding a screen is not
 * authorization; a revoked device must not be able to create a sale or a stock
 * movement no matter what the client believes.
 */
@Injectable()
export class DeviceSessionGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user as AuthenticatedUser | undefined;

    if (!user?.deviceId) {
      return true;
    }

    const device = await this.prisma.device.findUnique({
      where: { id: user.deviceId },
      select: { status: true, userId: true, businessId: true },
    });

    // A revoked device, a deleted device, and a token whose device now belongs
    // to a different worker or business are one answer: this session is over.
    if (
      !device ||
      device.status !== DeviceStatus.ACTIVE ||
      device.userId !== user.userId ||
      device.businessId !== user.businessId
    ) {
      throw new UnauthorizedException(
        'Kifaa hiki kimefutwa · This device has been revoked. Ask the owner to enroll it again.',
      );
    }

    return true;
  }
}
