import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import type { AuthenticatedUser } from '../decorators/current-user.decorator';

/**
 * Stops a suspended shop — and, since Phase 9, a switched-off person — at the
 * backend.
 *
 * A platform administrator suspending a shop account expects it to stop
 * working now, not in eight hours when the tokens its people are already
 * holding happen to expire. That is the same rule device revocation chose in
 * Phase 2, and for the same reason: an account that is suspended everywhere
 * except in the sessions already open is not suspended.
 *
 * **Phase 9 gave the same treatment to a person.** An owner switching off
 * somebody who has left expects them gone now. Every place identity is
 * *established* already checked `User.isActive` — `login`, `loginDevice`,
 * `deviceSignInOptions`, `profileFor`, `PermissionsGuard` — so the one
 * remaining gap was exactly the same one: a token minted before they left.
 * Without this, a departed manager kept full read access to the shop until
 * their token expired, and stripping their permissions did not help, because
 * reading a branch list or a product needs none.
 *
 * **The class name is now narrower than the job it does.** Renaming it is a
 * rename, which this repository asks permission for; it is logged in
 * PROGRESS.md §9 instead. Read it as "the guard that refuses a session whose
 * standing has changed since it was issued".
 *
 * One primary-key lookup per authenticated request, answering both questions
 * at once through the user's relation to their business. That is the same
 * single query this guard already made — it changed which table it starts
 * from, not how many it touches. A platform administrator now pays for it too,
 * where before they skipped it: they have no business to check, but they are
 * still a person whose account can be switched off, and the alternative is a
 * guard that is correct for everybody except the most privileged role in the
 * system. See PROGRESS.md §6 for the original note on this being a hot path.
 */
@Injectable()
export class BusinessActiveGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const user = context.switchToHttp().getRequest().user as AuthenticatedUser | undefined;

    // No user means a @Public() route, which never reaches a guard with one.
    if (!user) {
      return true;
    }

    const record = await this.prisma.user.findUnique({
      where: { id: user.userId },
      select: { isActive: true, business: { select: { isActive: true } } },
    });

    // A deleted account and a switched-off one are one answer: this session is
    // over. Deliberately 403 rather than 401 — for a suspended shop the
    // credentials are perfectly good and sending somebody back to sign in
    // would loop them into the same place, and for a person who has left,
    // inviting them to sign in again is worse than telling them plainly.
    if (!record?.isActive) {
      throw new ForbiddenException(
        'Akaunti yako imesimamishwa · This account is no longer active. Ask the shop owner.',
      );
    }

    if (record.business && !record.business.isActive) {
      throw new ForbiddenException(
        'Akaunti ya duka hili imesimamishwa · This shop account has been suspended. Contact Shoprex.',
      );
    }

    return true;
  }
}
