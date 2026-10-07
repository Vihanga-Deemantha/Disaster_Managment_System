import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';
import { z } from 'zod';

const base64Key = (minBytes: number) =>
  z
    .string()
    .min(1)
    .refine((value) => Buffer.from(value, 'base64').length >= minBytes, {
      message: `must be base64 and decode to at least ${minBytes} bytes`,
    });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  MONGODB_URI: z.string().min(1).default('mongodb://127.0.0.1:27017/safezone_dev'),
  JWT_ACCESS_SECRET: z.string().min(32, 'must be at least 32 characters (use `npm run setup`)'),
  NIC_ENCRYPTION_KEY: base64Key(32),
  NIC_HASH_KEY: base64Key(32),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  COOKIE_SECURE: z.stringbool().optional(),
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error', 'silent']).default('info'),
});

export interface AppConfig {
  env: 'development' | 'test' | 'production';
  isProduction: boolean;
  port: number;
  mongoUri: string;
  jwtAccessSecret: string;
  /** AES-256-GCM key (exactly 32 bytes) used to encrypt NICs at rest. */
  nicEncryptionKey: Buffer;
  /** HMAC-SHA256 key used for the NIC uniqueness lookup. */
  nicHashKey: Buffer;
  corsOrigins: string[];
  /** `Secure` flag on cookies: on in production, off for plain-http local development. */
  cookieSecure: boolean;
  trustProxy: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error' | 'silent';
}

export class ConfigError extends Error {
  constructor(problems: string[]) {
    super(
      `Invalid environment configuration:\n${problems.map((p) => `  - ${p}`).join('\n')}\n` +
        'Run `npm run setup` to create backend/.env with fresh secrets (see README).',
    );
    this.name = 'ConfigError';
  }
}

/** Validates the environment once at start-up so a missing secret fails loudly, not at first login. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    throw new ConfigError(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`));
  }
  const values = parsed.data;
  const isProduction = values.NODE_ENV === 'production';
  return {
    env: values.NODE_ENV,
    isProduction,
    port: values.PORT,
    mongoUri: values.MONGODB_URI,
    jwtAccessSecret: values.JWT_ACCESS_SECRET,
    nicEncryptionKey: Buffer.from(values.NIC_ENCRYPTION_KEY, 'base64').subarray(0, 32),
    nicHashKey: Buffer.from(values.NIC_HASH_KEY, 'base64'),
    corsOrigins: values.CORS_ORIGINS.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    cookieSecure: values.COOKIE_SECURE ?? isProduction,
    trustProxy: values.TRUST_PROXY,
    logLevel: values.LOG_LEVEL,
  };
}

/**
 * Loads `backend/.env` when present. Hosting platforms inject real environment variables instead,
 * and a variable that is already set always wins over the file.
 */
export function loadEnvFileIfPresent(file = resolve(__dirname, '../../../.env')): boolean {
  if (!existsSync(file)) return false;
  for (const [name, value] of Object.entries(parseEnv(readFileSync(file, 'utf8')))) {
    process.env[name] ??= value;
  }
  return true;
}
