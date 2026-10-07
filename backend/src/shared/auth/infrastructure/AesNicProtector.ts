import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';
import type { NicProtector } from '../application/ports';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const KEY_BYTES = 32;

/**
 * NICs are stored encrypted (AES-256-GCM, a fresh random IV each time) plus a keyed HMAC for the
 * duplicate check (master plan §7.1.6). A database leak alone exposes neither the NIC nor a
 * lookup table of NIC hashes, because both keys live in the environment.
 */
export class AesNicProtector implements NicProtector {
  constructor(
    private readonly encryptionKey: Buffer,
    private readonly hashKey: Buffer,
  ) {
    if (encryptionKey.length !== KEY_BYTES) {
      throw new Error(`NIC encryption key must be exactly ${KEY_BYTES} bytes.`);
    }
  }

  hash(canonicalNic: string): string {
    return createHmac('sha256', this.hashKey).update(canonicalNic).digest('hex');
  }

  encrypt(nic: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.encryptionKey, iv);
    const ciphertext = Buffer.concat([cipher.update(nic, 'utf8'), cipher.final()]);
    return [iv, cipher.getAuthTag(), ciphertext].map((part) => part.toString('base64')).join('.');
  }

  decrypt(encrypted: string): string {
    const [iv, tag, ciphertext] = encrypted.split('.').map((part) => Buffer.from(part, 'base64'));
    const decipher = createDecipheriv(ALGORITHM, this.encryptionKey, iv as Buffer);
    decipher.setAuthTag(tag as Buffer);
    return Buffer.concat([decipher.update(ciphertext as Buffer), decipher.final()]).toString(
      'utf8',
    );
  }
}
