import { createHash } from 'node:crypto';
import type { LoginThrottleRepository, LoginThrottleState } from '../application/ports';
import { LoginThrottleModel } from './models';

/** Identifiers (phone numbers, emails) are hashed so the collection holds no personal data. */
const keyOf = (identifier: string): string => createHash('sha256').update(identifier).digest('hex');

export class MongoLoginThrottleRepository implements LoginThrottleRepository {
  async get(key: string): Promise<LoginThrottleState | null> {
    const doc = await LoginThrottleModel.findById(keyOf(key)).lean();
    return doc ? { failures: doc.failures, lastFailedAt: doc.lastFailedAt } : null;
  }

  async recordFailure(key: string, at: Date): Promise<void> {
    await LoginThrottleModel.updateOne(
      { _id: keyOf(key) },
      { $inc: { failures: 1 }, $set: { lastFailedAt: at } },
      { upsert: true },
    );
  }

  async reset(key: string): Promise<void> {
    await LoginThrottleModel.deleteOne({ _id: keyOf(key) });
  }
}
