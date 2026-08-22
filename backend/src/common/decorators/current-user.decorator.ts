import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { UserRole } from '@prisma/client';

/** The authenticated principal, resolved from the token by JwtAuthGuard. */
export interface AuthenticatedUser {
  userId: string;
  email: string;
  role: UserRole;
  /** Null only for platform administrators, who sit above any single tenant. */
  businessId: string | null;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    return context.switchToHttp().getRequest().user as AuthenticatedUser;
  },
);
