import jwt from 'jsonwebtoken';
import { UnauthorizedError } from '../../errors/DomainError';
import { nullLogger, type Logger } from '../../logging/Logger';
import { FixedClock } from '../../time/Clock';
import type { AuthContext } from '../domain/types';
import { AesNicProtector } from '../infrastructure/AesNicProtector';
import { CryptoRefreshTokenIssuer } from '../infrastructure/CryptoRefreshTokenIssuer';
import { JwtAccessTokenService } from '../infrastructure/JwtAccessTokenService';
import {
  Argon2PasswordHasher,
  BcryptPasswordHasher,
  PasswordHasherChain,
  createPasswordHasher,
} from '../infrastructure/passwordHashers';

/** Cheap parameters keep the suite fast; production uses the library defaults. */
const FAST_ARGON2 = { memoryCost: 1024, timeCost: 2, parallelism: 1 };
const loadArgon2 = () => import('argon2');

describe('Auth §7.1.3 password hashing', () => {
  it('argon2id hashes are salted, verify correctly and reject a wrong password', async () => {
    const hasher = new Argon2PasswordHasher(await loadArgon2(), FAST_ARGON2);

    const [a, b] = [await hasher.hash('hunter2 hunter2'), await hasher.hash('hunter2 hunter2')];

    expect(a).toMatch(/^\$argon2id\$/);
    expect(a).not.toBe(b);
    expect(await hasher.verify(a, 'hunter2 hunter2')).toBe(true);
    expect(await hasher.verify(a, 'hunter3 hunter3')).toBe(false);
  });

  it('treats a malformed argon2 hash as a failed login, not a crash', async () => {
    const hasher = new Argon2PasswordHasher(await loadArgon2(), FAST_ARGON2);

    expect(await hasher.verify('not-a-hash', 'whatever')).toBe(false);
  });

  it('works with the library default cost parameters too', async () => {
    const hasher = new Argon2PasswordHasher(await loadArgon2());

    expect(await hasher.verify(await hasher.hash('defaults are fine'), 'defaults are fine')).toBe(
      true,
    );
  });

  it('bcrypt fallback hashes and verifies', async () => {
    const hasher = new BcryptPasswordHasher(4);

    const hash = await hasher.hash('fallback password');

    expect(hash).toMatch(/^\$2[aby]\$04\$/);
    expect(await hasher.verify(hash, 'fallback password')).toBe(true);
    expect(await hasher.verify(hash, 'other password')).toBe(false);
  });

  it('bcrypt uses cost 12 unless told otherwise', async () => {
    expect(await new BcryptPasswordHasher().hash('x')).toMatch(/^\$2[aby]\$12\$/);
  });

  it('verifies by the stored hash’s prefix and refuses hashes it does not recognise', async () => {
    const argon2 = new Argon2PasswordHasher(await loadArgon2(), FAST_ARGON2);
    const bcrypt = new BcryptPasswordHasher(4);
    const chain = new PasswordHasherChain(argon2, [
      { prefix: '$argon2', hasher: argon2 },
      { prefix: '$2', hasher: bcrypt },
    ]);

    expect((await chain.hash('same password')).startsWith('$argon2id$')).toBe(true);
    expect(await chain.verify(await argon2.hash('same password'), 'same password')).toBe(true);
    expect(await chain.verify(await bcrypt.hash('same password'), 'same password')).toBe(true);
    expect(await chain.verify('plaintext:same password', 'same password')).toBe(false);
  });

  it('prefers argon2id when it loads, and still accepts bcrypt hashes created elsewhere', async () => {
    const hasher = await createPasswordHasher({
      logger: nullLogger,
      argon2: FAST_ARGON2,
      bcryptCost: 4,
    });
    const bcryptHash = await new BcryptPasswordHasher(4).hash('made on another laptop');

    expect((await hasher.hash('new account')).startsWith('$argon2id$')).toBe(true);
    expect(await hasher.verify(bcryptHash, 'made on another laptop')).toBe(true);
  });

  it('falls back to bcrypt with a warning when argon2 cannot be loaded', async () => {
    const warn = jest.fn();
    const logger = { ...nullLogger, warn } as Logger;

    const hasher = await createPasswordHasher({
      logger,
      bcryptCost: 4,
      loadArgon2: () => Promise.reject(new Error('node-gyp build failed')),
    });
    const argon2Hash = await new Argon2PasswordHasher(await loadArgon2(), FAST_ARGON2).hash('abc');

    expect((await hasher.hash('abc')).startsWith('$2')).toBe(true);
    expect(await hasher.verify(await hasher.hash('abc'), 'abc')).toBe(true);
    expect(await hasher.verify(argon2Hash, 'abc')).toBe(false);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('bcrypt'), {
      reason: 'node-gyp build failed',
    });
  });

  it('reports a non-Error load failure too', async () => {
    const warn = jest.fn();

    await createPasswordHasher({
      logger: { ...nullLogger, warn } as Logger,
      loadArgon2: () => Promise.reject('plain string'),
    });

    expect(warn).toHaveBeenCalledWith(expect.any(String), { reason: 'plain string' });
  });

  it('loads the real argon2 module when no loader is injected', async () => {
    const hasher = await createPasswordHasher({ logger: nullLogger, argon2: FAST_ARGON2 });

    expect((await hasher.hash('real module')).startsWith('$argon2id$')).toBe(true);
  });
});

const SECRET = 's'.repeat(40);
const context: AuthContext = {
  userId: 'u-1',
  role: 'DISTRICT_OFFICER',
  sessionId: 'family-1',
  authenticatedAt: new Date('2026-10-07T08:55:00.000Z'),
  district: 'GAMPAHA',
  riverBasinId: 'basin-kelani',
  organizationId: 'org-1',
  organizationType: 'NGO',
};

function jwtService(clock = new FixedClock('2026-10-07T09:00:00.000Z')) {
  return { clock, service: new JwtAccessTokenService({ secret: SECRET, ttlSeconds: 900, clock }) };
}

describe('Auth §7.1.3 access tokens (JWT, HS256, 15 minutes)', () => {
  it('round-trips every claim the guards need', () => {
    const { service } = jwtService();

    const { token } = service.sign(context);

    expect(service.verify(token)).toEqual(context);
  });

  it('expires 15 minutes after issue, by the injected clock', () => {
    const { service } = jwtService();

    expect(service.sign(context).expiresAt).toEqual(new Date('2026-10-07T09:15:00.000Z'));
  });

  it('puts the signing algorithm and standard claims in the token, timed by the injected clock', () => {
    const { service, clock } = jwtService();
    const issuedAt = Math.floor(clock.now().getTime() / 1000);
    const decoded = jwt.decode(service.sign(context).token, { complete: true });

    expect(decoded?.header.alg).toBe('HS256');
    expect(decoded?.payload).toMatchObject({
      sub: 'u-1',
      sid: 'family-1',
      iat: issuedAt,
      exp: issuedAt + 900,
      authTime: Math.floor(context.authenticatedAt.getTime() / 1000),
    });
  });

  it('is rejected as TOKEN_EXPIRED once past expiry plus skew', () => {
    const { service, clock } = jwtService();
    const { token } = service.sign(context);
    clock.advance(931_000);

    expect(() => service.verify(token)).toThrow(expect.objectContaining({ code: 'TOKEN_EXPIRED' }));
  });

  it('is rejected when a character of the payload is altered', () => {
    const { service } = jwtService();
    const [header, payload, signature] = service.sign(context).token.split('.') as [
      string,
      string,
      string,
    ];
    const tampered = `${header}.${Buffer.from(
      JSON.stringify({
        ...JSON.parse(Buffer.from(payload, 'base64url').toString()),
        role: 'DMC_OFFICER',
      }),
    ).toString('base64url')}.${signature}`;

    expect(() => service.verify(tampered)).toThrow(
      expect.objectContaining({ code: 'UNAUTHENTICATED' }),
    );
  });

  it('is rejected when signed with another secret', () => {
    const { service } = jwtService();
    const forged = jwt.sign(
      { sub: 'u-1', role: 'DMC_OFFICER', sid: 's', authTime: 1 },
      'x'.repeat(40),
    );

    expect(() => service.verify(forged)).toThrow(UnauthorizedError);
  });

  it('refuses an unsigned token (alg: none), the classic forgery', () => {
    const { service } = jwtService();
    const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
    const unsigned = `${encode({ alg: 'none', typ: 'JWT' })}.${encode({
      sub: 'u-1',
      role: 'DMC_OFFICER',
      sid: 's',
      authTime: 1,
      exp: 9_999_999_999,
    })}.`;

    expect(() => service.verify(unsigned)).toThrow(
      expect.objectContaining({ code: 'UNAUTHENTICATED' }),
    );
  });

  it('refuses a token signed with a different HMAC algorithm even under the right secret', () => {
    const { service } = jwtService();
    const hs512 = jwt.sign({ sub: 'u-1', role: 'DMC_OFFICER', sid: 's', authTime: 1 }, SECRET, {
      algorithm: 'HS512',
      expiresIn: 60,
    });

    expect(() => service.verify(hs512)).toThrow(
      expect.objectContaining({ code: 'UNAUTHENTICATED' }),
    );
  });

  it('refuses garbage', () => {
    const { service } = jwtService();

    expect(() => service.verify('definitely not a token')).toThrow(UnauthorizedError);
  });

  it('leaves out scope claims a user does not have', () => {
    const { service } = jwtService();
    const minimal: AuthContext = {
      userId: 'u-2',
      role: 'DMC_OFFICER',
      sessionId: 'f',
      authenticatedAt: context.authenticatedAt,
    };

    const decoded = service.verify(service.sign(minimal).token);

    expect(decoded.district).toBeUndefined();
    expect(decoded.organizationId).toBeUndefined();
  });
});

describe('Auth §7.1.6 NIC protection (AES-256-GCM + HMAC)', () => {
  const encryptionKey = Buffer.alloc(32, 1);
  const hashKey = Buffer.alloc(32, 2);
  const protector = new AesNicProtector(encryptionKey, hashKey);

  it('encrypts so the NIC cannot be read from the stored value, and decrypts it back', () => {
    const encrypted = protector.encrypt('853400937V');

    expect(encrypted).not.toContain('853400937');
    expect(Buffer.from(encrypted.split('.')[2] as string, 'base64').toString()).not.toContain(
      '853400937',
    );
    expect(protector.decrypt(encrypted)).toBe('853400937V');
  });

  it('uses a fresh random IV each time, so equal NICs do not look equal at rest', () => {
    expect(protector.encrypt('853400937V')).not.toBe(protector.encrypt('853400937V'));
  });

  it('detects tampering (GCM authentication) instead of returning garbage', () => {
    const [iv, tag, ciphertext] = protector.encrypt('853400937V').split('.') as [
      string,
      string,
      string,
    ];
    const flipped = Buffer.from(ciphertext, 'base64');
    flipped[0] = (flipped[0] as number) ^ 0xff;

    expect(() => protector.decrypt([iv, tag, flipped.toString('base64')].join('.'))).toThrow();
  });

  it('cannot be decrypted with another key', () => {
    const other = new AesNicProtector(Buffer.alloc(32, 9), hashKey);

    expect(() => other.decrypt(protector.encrypt('853400937V'))).toThrow();
  });

  it('hashes deterministically for the duplicate check, and differently per key and per NIC', () => {
    const rekeyed = new AesNicProtector(encryptionKey, Buffer.alloc(32, 3));

    expect(protector.hash('198534000937')).toBe(protector.hash('198534000937'));
    expect(protector.hash('198534000937')).toMatch(/^[0-9a-f]{64}$/);
    expect(protector.hash('198534000937')).not.toBe(protector.hash('198534000938'));
    expect(protector.hash('198534000937')).not.toBe(rekeyed.hash('198534000937'));
  });

  it('refuses an encryption key that is not exactly 32 bytes', () => {
    expect(() => new AesNicProtector(Buffer.alloc(16), hashKey)).toThrow(/32 bytes/);
  });
});

describe('Auth §7.1.3 refresh token issuer', () => {
  const issuer = new CryptoRefreshTokenIssuer();

  it('generates unguessable, distinct 256-bit tokens', () => {
    const [a, b] = [issuer.generate(), issuer.generate()];

    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a).not.toBe(b);
  });

  it('stores only a SHA-256 hash, never the token', () => {
    const token = issuer.generate();

    expect(issuer.hash(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(issuer.hash(token)).not.toContain(token);
    expect(issuer.hash(token)).toBe(issuer.hash(token));
    expect(issuer.hash(token)).not.toBe(issuer.hash(`${token}x`));
  });
});
