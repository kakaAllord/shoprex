import { apiRequest } from './client';

export type UserRole = 'PLATFORM_ADMIN' | 'OWNER' | 'MANAGER' | 'WORKER';
export type ConsoleName = 'admin' | 'owner';

export interface AuthProfile {
  id: string;
  email: string;
  phone: string | null;
  fullName: string;
  role: UserRole;
  businessId: string | null;
  businessName: string | null;
  console: ConsoleName;
}

export interface LoginResult {
  accessToken: string;
  expiresIn: string;
  user: AuthProfile;
}

export interface DevCredential {
  label: string;
  email: string;
  password: string;
  role: UserRole;
}

/** Where an account belongs. The backend decides; the web app only follows. */
export function consolePath(console: ConsoleName): string {
  return console === 'admin' ? '/admin' : '/owner';
}

export interface SignupInput {
  shopName: string;
  email: string;
  phone: string;
  password: string;
  fullName?: string;
}

/** Owner self-registration: creates the shop and the account in one step. */
export function signup(input: SignupInput): Promise<LoginResult> {
  return apiRequest<LoginResult>('/auth/signup', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function login(email: string, password: string): Promise<LoginResult> {
  return apiRequest<LoginResult>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export function fetchProfile(accessToken: string): Promise<AuthProfile> {
  return apiRequest<AuthProfile>('/auth/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

/**
 * Seeded development logins, so opening the login page fills the form in.
 * The backend returns an empty list unless DEV_LOGIN_AUTOFILL is on and the
 * environment is not production, so this is never populated in a deployment.
 */
export async function fetchDevCredentials(): Promise<DevCredential[]> {
  try {
    return await apiRequest<DevCredential[]>('/auth/dev-credentials');
  } catch {
    return [];
  }
}
