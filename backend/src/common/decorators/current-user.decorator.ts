import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { UserRole } from '@prisma/client';

/** The authenticated principal, resolved from the token by JwtAuthGuard. */
export interface AuthenticatedUser {
  userId: string;
  /** Null for workers, who are created with a name and sign in by device. */
  email: string | null;
  role: UserRole;
  /** Null only for platform administrators, who sit above any single tenant. */
  businessId: string | null;
  /**
   * The enrolled device this request came from, when it came from one. Null
   * for owners, managers, and platform administrators signing in by email.
   * Present for a worker, whose device *is* their attribution — which is why
   * V1 has no per-worker PIN.
   */
  deviceId: string | null;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    return context.switchToHttp().getRequest().user as AuthenticatedUser;
  },
);
