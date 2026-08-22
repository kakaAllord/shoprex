import { plainToInstance } from 'class-transformer';
import {
  IsBooleanString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

export enum NodeEnvironment {
  Development = 'development',
  Test = 'test',
  Production = 'production',
}

/**
 * Fail fast on misconfiguration: the API refuses to boot when a required
 * variable is missing or malformed, rather than failing on the first request.
 */
export class EnvironmentVariables {
  @IsEnum(NodeEnvironment)
  @IsOptional()
  NODE_ENV: NodeEnvironment = NodeEnvironment.Development;

  @IsInt()
  @Min(1)
  @Max(65535)
  @IsOptional()
  PORT: number = 3001;

  @IsString()
  @IsOptional()
  API_PREFIX: string = 'api/v1';

  @IsString()
  @IsNotEmpty({
    message:
      'DATABASE_URL is required. Copy backend/.env.example to backend/.env and set the PostgreSQL connection string.',
  })
  DATABASE_URL!: string;

  /** Comma-separated browser origins allowed to call the API. Set in .env. */
  @IsString()
  @IsNotEmpty({
    message:
      'CORS_ORIGINS is required. Copy backend/.env.example to backend/.env and list the web app origin.',
  })
  CORS_ORIGINS!: string;

  @IsString()
  @IsOptional()
  DEFAULT_TIMEZONE: string = 'Africa/Dar_es_Salaam';

  @IsString()
  @IsOptional()
  LOG_LEVEL: string = 'debug';

  @IsString()
  @MinLength(16, {
    message:
      'JWT_SECRET must be at least 16 characters. Set it in backend/.env (see .env.example).',
  })
  @IsNotEmpty()
  JWT_SECRET!: string;

  @IsString()
  @IsOptional()
  JWT_EXPIRES_IN: string = '8h';

  /**
   * Development convenience only. When 'true' (and NODE_ENV is not production)
   * the login form prefills the seeded accounts so testing needs no typing.
   */
  @IsBooleanString()
  @IsOptional()
  DEV_LOGIN_AUTOFILL?: string;

  @IsString()
  @IsOptional()
  DEV_ADMIN_EMAIL?: string;

  @IsString()
  @IsOptional()
  DEV_OWNER_EMAIL?: string;

  @IsString()
  @IsOptional()
  DEV_SEED_PASSWORD?: string;

  /** Requests per minute allowed on the whole API, per client address. */
  @IsInt()
  @Min(1)
  @IsOptional()
  RATE_LIMIT_DEFAULT: number = 120;

  /** Requests per minute allowed on sign-in and sign-up, per client address. */
  @IsInt()
  @Min(1)
  @IsOptional()
  RATE_LIMIT_AUTH: number = 10;

  /** Rate limit window in milliseconds. */
  @IsInt()
  @Min(1000)
  @IsOptional()
  RATE_LIMIT_TTL_MS: number = 60000;
}

export function validateEnvironment(
  raw: Record<string, unknown>,
): EnvironmentVariables {
  const validated = plainToInstance(EnvironmentVariables, raw, {
    enableImplicitConversion: true,
    exposeDefaultValues: true,
  });

  const errors = validateSync(validated, { skipMissingProperties: false });

  if (errors.length > 0) {
    const details = errors
      .map((error) => Object.values(error.constraints ?? {}).join('; '))
      .join('\n  - ');
    throw new Error(`Invalid backend environment configuration:\n  - ${details}`);
  }

  return validated;
}
