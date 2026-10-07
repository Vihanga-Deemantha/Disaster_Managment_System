import jwt from 'jsonwebtoken';
import type { District, OrganizationType, Role } from '../../contracts/enums';
import { UnauthorizedError } from '../../errors/DomainError';
import type { Clock } from '../../time/Clock';
import type { AccessTokenService, SignedAccessToken } from '../application/ports';
import type { AuthContext } from '../domain/types';

interface Claims extends jwt.JwtPayload {
  role: Role;
  /** Refresh-token family of this sign-in. */
  sid: string;
  /** Epoch seconds the password was last entered. */
  authTime: number;
  district?: District;
  riverBasinId?: string;
  organizationId?: string;
  organizationType?: OrganizationType;
}

const CLOCK_SKEW_SECONDS = 30;
const toSeconds = (date: Date): number => Math.floor(date.getTime() / 1000);

export interface JwtOptions {
  /** At least 32 random bytes (validated at start-up by `loadConfig`). */
  secret: string;
  ttlSeconds: number;
  clock: Clock;
}

/**
 * HS256 access tokens. The algorithm is pinned on verify so a forged `alg: none` token is refused,
 * and "now" comes from the injected clock so expiry is testable (master plan §7.1.3).
 */
export class JwtAccessTokenService implements AccessTokenService {
  constructor(private readonly options: JwtOptions) {}

  sign(context: AuthContext): SignedAccessToken {
    const issuedAt = toSeconds(this.options.clock.now());
    const expiresAt = issuedAt + this.options.ttlSeconds;
    const claims: Claims = {
      sub: context.userId,
      role: context.role,
      sid: context.sessionId,
      authTime: toSeconds(context.authenticatedAt),
      district: context.district,
      riverBasinId: context.riverBasinId,
      organizationId: context.organizationId,
      organizationType: context.organizationType,
      iat: issuedAt,
      exp: expiresAt,
    };
    return {
      token: jwt.sign(claims, this.options.secret, { algorithm: 'HS256' }),
      expiresAt: new Date(expiresAt * 1000),
    };
  }

  verify(token: string): AuthContext {
    const claims = this.decode(token);
    return {
      userId: claims.sub as string,
      role: claims.role,
      sessionId: claims.sid,
      authenticatedAt: new Date(claims.authTime * 1000),
      district: claims.district,
      riverBasinId: claims.riverBasinId,
      organizationId: claims.organizationId,
      organizationType: claims.organizationType,
    };
  }

  private decode(token: string): Claims {
    try {
      return jwt.verify(token, this.options.secret, {
        algorithms: ['HS256'],
        clockTolerance: CLOCK_SKEW_SECONDS,
        clockTimestamp: toSeconds(this.options.clock.now()),
      }) as Claims;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new UnauthorizedError('TOKEN_EXPIRED', 'The access token expired.');
      }
      throw new UnauthorizedError('UNAUTHENTICATED', 'Sign in required.');
    }
  }
}
