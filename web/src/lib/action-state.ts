/**
 * What every server action in this console returns.
 *
 * It lives here rather than beside the actions because a `'use server'` file
 * may export only async functions — a shared constant in one would be a build
 * error, and the shape is worth having in one place regardless.
 */
export interface ActionState {
  error: string | null;
  message: string | null;
  /**
   * Set only where a screen must show something the backend will never say
   * again: today, the one-time device enrollment code.
   */
  secret?: { code: string; deviceName: string; expiresAt: string } | null;
}

export const IDLE: ActionState = { error: null, message: null, secret: null };
