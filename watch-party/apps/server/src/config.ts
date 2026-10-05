/**
 * Environment configuration, validated once at start-up so a misconfigured
 * deployment fails fast instead of at the first request.
 */
import { randomBytes } from 'node:crypto';
import { z } from 'zod';

const bool = z
  .enum(['1', '0', 'true', 'false', 'yes', 'no'])
  .transform((v) => v === '1' || v === 'true' || v === 'yes');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().min(0).max(65_535).default(8080),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  TRUST_PROXY: bool.default(false),
  /** Comma-separated allowed browser origins, or `*`. Tokens are bearer, never cookies. */
  CORS_ORIGINS: z.string().default('*'),

  /** HMAC secret for session tokens. Required in production. */
  SESSION_SECRET: z.string().min(32).optional(),
  SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),

  /** Redis for catalog cache, room state and cross-instance broadcasts. */
  REDIS_URL: z.string().url().optional(),

  CATALOG_PROVIDER: z.enum(['auto', 'streaming-availability', 'tmdb', 'fixture']).default('auto'),
  /** Fixture data is fake; production refuses it unless explicitly allowed. */
  ALLOW_FIXTURE_CATALOG: bool.default(false),
  STREAMING_AVAILABILITY_API_KEY: z.string().min(1).optional(),
  /** `rapidapi` (X-RapidAPI-Key) or `direct` (api.movieofthenight.com, X-API-Key). */
  STREAMING_AVAILABILITY_MODE: z.enum(['rapidapi', 'direct']).default('rapidapi'),
  /** TMDB v4 read access token (preferred) or v3 API key. */
  TMDB_READ_TOKEN: z.string().min(1).optional(),
  TMDB_API_KEY: z.string().min(1).optional(),
  /** Spec: regional catalogs are cached for 12-24h. */
  CATALOG_TTL_HOURS: z.coerce.number().min(1).max(72).default(18),
  /** Upper bound on provider pages fetched per regional catalog (API cost control). */
  CATALOG_MAX_PAGES: z.coerce.number().int().min(1).max(500).default(25),

  /** How long a disconnected member keeps their seat (and host role). */
  MEMBER_GRACE_MS: z.coerce.number().int().min(0).max(300_000).default(20_000),
  /** Serves the browser test harness at /dev. Defaults to on outside production. */
  DEV_HARNESS: bool.optional(),
});

export type ResolvedProvider = 'streaming-availability' | 'tmdb' | 'fixture';

export interface AppConfig {
  env: 'development' | 'test' | 'production';
  host: string;
  port: number;
  logLevel: string;
  trustProxy: boolean;
  corsOrigins: '*' | string[];
  sessionSecret: string;
  sessionTtlMs: number;
  redisUrl: string | undefined;
  catalog: {
    provider: ResolvedProvider;
    streamingAvailability?: { apiKey: string; mode: 'rapidapi' | 'direct' };
    tmdb?: { readToken?: string; apiKey?: string };
    ttlMs: number;
    maxPages: number;
  };
  memberGraceMs: number;
  devHarness: boolean;
  warnings: string[];
}

export class ConfigError extends Error {
  override name = 'ConfigError';
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new ConfigError(`Invalid environment: ${details}`);
  }
  const e = parsed.data;
  const production = e.NODE_ENV === 'production';
  const warnings: string[] = [];

  let sessionSecret = e.SESSION_SECRET;
  if (!sessionSecret) {
    if (production) throw new ConfigError('SESSION_SECRET (32+ chars) is required in production');
    sessionSecret = randomBytes(32).toString('hex');
    warnings.push('SESSION_SECRET not set: using a random secret; sessions reset on restart');
  }

  const tmdb =
    e.TMDB_READ_TOKEN || e.TMDB_API_KEY
      ? {
          ...(e.TMDB_READ_TOKEN ? { readToken: e.TMDB_READ_TOKEN } : {}),
          ...(e.TMDB_API_KEY ? { apiKey: e.TMDB_API_KEY } : {}),
        }
      : undefined;
  const streamingAvailability = e.STREAMING_AVAILABILITY_API_KEY
    ? { apiKey: e.STREAMING_AVAILABILITY_API_KEY, mode: e.STREAMING_AVAILABILITY_MODE }
    : undefined;

  let provider: ResolvedProvider;
  switch (e.CATALOG_PROVIDER) {
    case 'auto':
      provider = streamingAvailability ? 'streaming-availability' : tmdb ? 'tmdb' : 'fixture';
      break;
    case 'streaming-availability':
      if (!streamingAvailability) {
        throw new ConfigError(
          'CATALOG_PROVIDER=streaming-availability needs STREAMING_AVAILABILITY_API_KEY',
        );
      }
      provider = 'streaming-availability';
      break;
    case 'tmdb':
      if (!tmdb)
        throw new ConfigError('CATALOG_PROVIDER=tmdb needs TMDB_READ_TOKEN or TMDB_API_KEY');
      provider = 'tmdb';
      break;
    default:
      provider = 'fixture';
  }
  if (provider === 'fixture') {
    if (production && !e.ALLOW_FIXTURE_CATALOG) {
      throw new ConfigError(
        'No catalog API configured. Set STREAMING_AVAILABILITY_API_KEY or TMDB_READ_TOKEN ' +
          '(or ALLOW_FIXTURE_CATALOG=1 for a demo deployment)',
      );
    }
    warnings.push('Using the built-in FIXTURE catalog: availability data is fake sample data');
  }
  if (!tmdb) warnings.push('No TMDB credentials: titles will lack runtime/backdrop enrichment');
  if (!e.REDIS_URL) {
    warnings.push(
      'REDIS_URL not set: using in-memory store (single instance, state lost on restart)',
    );
  }

  return {
    env: e.NODE_ENV,
    host: e.HOST,
    port: e.PORT,
    logLevel: e.LOG_LEVEL,
    trustProxy: e.TRUST_PROXY,
    corsOrigins:
      e.CORS_ORIGINS.trim() === '*'
        ? '*'
        : e.CORS_ORIGINS.split(',')
            .map((s) => s.trim())
            .filter(Boolean),
    sessionSecret,
    sessionTtlMs: e.SESSION_TTL_DAYS * 86_400_000,
    redisUrl: e.REDIS_URL,
    catalog: {
      provider,
      ...(streamingAvailability ? { streamingAvailability } : {}),
      ...(tmdb ? { tmdb } : {}),
      ttlMs: e.CATALOG_TTL_HOURS * 3_600_000,
      maxPages: e.CATALOG_MAX_PAGES,
    },
    memberGraceMs: e.MEMBER_GRACE_MS,
    devHarness: e.DEV_HARNESS ?? !production,
    warnings,
  };
}
