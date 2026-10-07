import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConfigError, loadConfig, loadEnvFileIfPresent } from '../env';

const key = (bytes: number): string => Buffer.alloc(bytes, 5).toString('base64');
const validEnv = {
  JWT_ACCESS_SECRET: 'j'.repeat(40),
  NIC_ENCRYPTION_KEY: key(32),
  NIC_HASH_KEY: key(32),
};

describe('loadConfig', () => {
  it('reads the real process environment when none is passed', () => {
    expect(loadConfig().env).toBe('test');
  });

  it('applies safe development defaults around the three required secrets', () => {
    const config = loadConfig(validEnv);

    expect(config).toMatchObject({
      env: 'development',
      isProduction: false,
      port: 4000,
      mongoUri: 'mongodb://127.0.0.1:27017/safezone_dev',
      corsOrigins: ['http://localhost:5173'],
      cookieSecure: false,
      trustProxy: 0,
      logLevel: 'info',
    });
    expect(config.nicEncryptionKey).toHaveLength(32);
  });

  it('turns on Secure cookies in production by default, but lets an operator override it', () => {
    expect(loadConfig({ ...validEnv, NODE_ENV: 'production' })).toMatchObject({
      isProduction: true,
      cookieSecure: true,
    });
    expect(
      loadConfig({ ...validEnv, NODE_ENV: 'production', COOKIE_SECURE: 'false' }).cookieSecure,
    ).toBe(false);
    expect(loadConfig({ ...validEnv, COOKIE_SECURE: 'true' }).cookieSecure).toBe(true);
  });

  it('reads the port, proxy depth, log level and database from the environment', () => {
    const config = loadConfig({
      ...validEnv,
      PORT: '8080',
      TRUST_PROXY: '1',
      LOG_LEVEL: 'debug',
      MONGODB_URI: 'mongodb://db.example:27017/prod',
    });

    expect(config).toMatchObject({
      port: 8080,
      trustProxy: 1,
      logLevel: 'debug',
      mongoUri: 'mongodb://db.example:27017/prod',
    });
  });

  it('splits and trims the CORS allow-list and ignores blanks', () => {
    const config = loadConfig({ ...validEnv, CORS_ORIGINS: 'https://a.lk, https://b.lk ,,' });

    expect(config.corsOrigins).toEqual(['https://a.lk', 'https://b.lk']);
  });

  it('uses the first 32 bytes of a longer encryption key', () => {
    expect(loadConfig({ ...validEnv, NIC_ENCRYPTION_KEY: key(48) }).nicEncryptionKey).toHaveLength(
      32,
    );
  });

  it('fails with one readable error naming every missing secret, and says how to fix it', () => {
    let thrown: unknown;
    try {
      loadConfig({});
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(ConfigError);
    const message = (thrown as Error).message;
    expect(message).toContain('JWT_ACCESS_SECRET');
    expect(message).toContain('NIC_ENCRYPTION_KEY');
    expect(message).toContain('NIC_HASH_KEY');
    expect(message).toContain('npm run setup');
  });

  it.each([
    ['a short signing secret', { JWT_ACCESS_SECRET: 'too short' }],
    ['an encryption key shorter than 32 bytes', { NIC_ENCRYPTION_KEY: key(16) }],
    ['a hash key shorter than 32 bytes', { NIC_HASH_KEY: key(8) }],
    ['an unknown NODE_ENV', { NODE_ENV: 'staging' }],
    ['a port out of range', { PORT: '70000' }],
    ['a non-numeric port', { PORT: 'abc' }],
    ['an unknown log level', { LOG_LEVEL: 'chatty' }],
  ])('rejects %s', (_label, change) => {
    expect(() => loadConfig({ ...validEnv, ...change })).toThrow(ConfigError);
  });
});

describe('loadEnvFileIfPresent', () => {
  it('returns false when there is no .env file (hosting platforms set variables directly)', () => {
    expect(loadEnvFileIfPresent(join(tmpdir(), 'definitely-not-here', '.env'))).toBe(false);
  });

  it('loads variables from an existing file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'safezone-env-'));
    const file = join(dir, '.env');
    writeFileSync(file, 'SAFEZONE_ENV_FILE_PROBE=loaded\n');

    try {
      expect(loadEnvFileIfPresent(file)).toBe(true);
      expect(process.env.SAFEZONE_ENV_FILE_PROBE).toBe('loaded');
    } finally {
      delete process.env.SAFEZONE_ENV_FILE_PROBE;
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('never overrides a variable that is already set (the real environment wins)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'safezone-env-'));
    const file = join(dir, '.env');
    writeFileSync(file, 'SAFEZONE_ENV_WINS=from-file\n');
    process.env.SAFEZONE_ENV_WINS = 'from-environment';

    try {
      loadEnvFileIfPresent(file);
      expect(process.env.SAFEZONE_ENV_WINS).toBe('from-environment');
    } finally {
      delete process.env.SAFEZONE_ENV_WINS;
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('looks for backend/.env by default', () => {
    expect(typeof loadEnvFileIfPresent()).toBe('boolean');
  });
});
