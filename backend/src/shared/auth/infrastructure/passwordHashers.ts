import bcrypt from 'bcryptjs';
import type * as Argon2 from 'argon2';
import type { Logger } from '../../logging/Logger';
import type { PasswordHasher } from '../application/ports';

type Argon2Module = typeof Argon2;

export interface Argon2Options {
  memoryCost?: number;
  timeCost?: number;
  parallelism?: number;
}

/** argon2id: slow, memory-hard, salted (master plan §7.1.3). */
export class Argon2PasswordHasher implements PasswordHasher {
  constructor(
    private readonly argon2: Argon2Module,
    private readonly options: Argon2Options = {},
  ) {}

  hash(password: string): Promise<string> {
    return this.argon2.hash(password, { type: this.argon2.argon2id, ...this.options });
  }

  async verify(hash: string, password: string): Promise<boolean> {
    try {
      return await this.argon2.verify(hash, password);
    } catch {
      return false; // a malformed hash is a failed login, not a crash
    }
  }
}

/** Pure-JavaScript fallback for machines where argon2's native binary cannot be installed. */
export class BcryptPasswordHasher implements PasswordHasher {
  constructor(private readonly cost = 12) {}

  hash(password: string): Promise<string> {
    return bcrypt.hash(password, this.cost);
  }

  verify(hash: string, password: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }
}

/**
 * Hashes with the preferred algorithm but verifies by the prefix of the stored hash, so accounts
 * created on a machine without argon2 keep working on one that has it, and the other way round.
 */
export class PasswordHasherChain implements PasswordHasher {
  constructor(
    private readonly preferred: PasswordHasher,
    private readonly verifiers: readonly { prefix: string; hasher: PasswordHasher }[],
  ) {}

  hash(password: string): Promise<string> {
    return this.preferred.hash(password);
  }

  async verify(hash: string, password: string): Promise<boolean> {
    const match = this.verifiers.find((candidate) => hash.startsWith(candidate.prefix));
    return match ? match.hasher.verify(hash, password) : false;
  }
}

export interface PasswordHasherOptions {
  logger: Logger;
  argon2?: Argon2Options;
  bcryptCost?: number;
  /** Injected so the fallback path can be tested without uninstalling a package. */
  loadArgon2?: () => Promise<Argon2Module>;
}

/** argon2id when its native module loads (the plan's choice), bcrypt cost 12 otherwise. */
export async function createPasswordHasher(
  options: PasswordHasherOptions,
): Promise<PasswordHasher> {
  const bcryptHasher = new BcryptPasswordHasher(options.bcryptCost);
  const load = options.loadArgon2 ?? (() => import('argon2'));
  try {
    const argon2Hasher = new Argon2PasswordHasher(await load(), options.argon2);
    return new PasswordHasherChain(argon2Hasher, [
      { prefix: '$argon2', hasher: argon2Hasher },
      { prefix: '$2', hasher: bcryptHasher },
    ]);
  } catch (error) {
    options.logger.warn(
      'argon2 is unavailable on this machine; hashing passwords with bcrypt instead',
      {
        reason: error instanceof Error ? error.message : String(error),
      },
    );
    return new PasswordHasherChain(bcryptHasher, [{ prefix: '$2', hasher: bcryptHasher }]);
  }
}
