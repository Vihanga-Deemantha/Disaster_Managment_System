import { createHash, randomBytes } from 'node:crypto';
import type { RefreshTokenIssuer } from '../application/ports';

/**
 * 256-bit random refresh tokens. Only the SHA-256 hash is stored, so a leaked database cannot be
 * replayed. A fast hash is right here (unlike passwords) because the token is already unguessable.
 */
export class CryptoRefreshTokenIssuer implements RefreshTokenIssuer {
  generate(): string {
    return randomBytes(32).toString('base64url');
  }

  hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
