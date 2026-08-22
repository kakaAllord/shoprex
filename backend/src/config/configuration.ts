import { EnvironmentVariables } from './env.validation';

export interface AppConfig {
  nodeEnv: string;
  port: number;
  apiPrefix: string;
  corsOrigins: string[];
  defaultTimezone: string;
  logLevel: string;
  jwtSecret: string;
  jwtExpiresIn: string;
  devLoginAutofill: boolean;
  devAdminEmail: string;
  devOwnerEmail: string;
  devSeedPassword: string;
  rateLimitDefault: number;
  rateLimitAuth: number;
  rateLimitTtlMs: number;
}

/**
 * Single typed view of the environment. Modules read configuration from here
 * instead of touching process.env directly.
 */
export function appConfiguration(): { app: AppConfig } {
  const env = process.env as unknown as EnvironmentVariables;

  return {
    app: {
      nodeEnv: env.NODE_ENV ?? 'development',
      port: Number(env.PORT ?? 3001),
      apiPrefix: env.API_PREFIX ?? 'api/v1',
      corsOrigins: String(env.CORS_ORIGINS)
        .split(',')
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0),
      defaultTimezone: env.DEFAULT_TIMEZONE ?? 'Africa/Dar_es_Salaam',
      logLevel: env.LOG_LEVEL ?? 'debug',
      jwtSecret: env.JWT_SECRET,
      jwtExpiresIn: env.JWT_EXPIRES_IN ?? '8h',
      devLoginAutofill: String(env.DEV_LOGIN_AUTOFILL ?? 'false') === 'true',
      devAdminEmail: (env.DEV_ADMIN_EMAIL ?? '').trim().toLowerCase(),
      devOwnerEmail: (env.DEV_OWNER_EMAIL ?? '').trim().toLowerCase(),
      devSeedPassword: env.DEV_SEED_PASSWORD ?? '',
      rateLimitDefault: Number(env.RATE_LIMIT_DEFAULT ?? 120),
      rateLimitAuth: Number(env.RATE_LIMIT_AUTH ?? 10),
      rateLimitTtlMs: Number(env.RATE_LIMIT_TTL_MS ?? 60000),
    },
  };
}
