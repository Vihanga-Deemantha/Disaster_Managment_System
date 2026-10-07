import type { RefreshSessionRepository } from '../application/ports';
import type { RefreshSession } from '../domain/types';
import { RefreshSessionModel, type RefreshSessionDoc } from './models';

function toSession(doc: RefreshSessionDoc): RefreshSession {
  return {
    sessionId: doc._id,
    userId: doc.userId,
    familyId: doc.familyId,
    tokenHash: doc.tokenHash,
    createdAt: doc.createdAt,
    expiresAt: doc.expiresAt,
    absoluteExpiresAt: doc.absoluteExpiresAt,
    authenticatedAt: doc.authenticatedAt,
    rotatedAt: doc.rotatedAt ?? undefined,
    revokedAt: doc.revokedAt ?? undefined,
    userAgent: doc.userAgent,
    ip: doc.ip,
  };
}

export class MongoRefreshSessionRepository implements RefreshSessionRepository {
  async insert(session: RefreshSession): Promise<void> {
    const { sessionId, ...rest } = session;
    await RefreshSessionModel.create({ _id: sessionId, ...rest });
  }

  async findByTokenHash(tokenHash: string): Promise<RefreshSession | null> {
    const doc = await RefreshSessionModel.findOne({ tokenHash }).lean();
    return doc ? toSession(doc) : null;
  }

  async markRotated(sessionId: string, at: Date): Promise<boolean> {
    // Matches only a row nobody has rotated or revoked yet, so exactly one concurrent caller wins.
    const result = await RefreshSessionModel.updateOne(
      { _id: sessionId, rotatedAt: null, revokedAt: null },
      { $set: { rotatedAt: at } },
    );
    return result.modifiedCount === 1;
  }

  async revokeFamily(familyId: string, at: Date): Promise<void> {
    await RefreshSessionModel.updateMany(
      { familyId, revokedAt: null },
      { $set: { revokedAt: at } },
    );
  }

  async revokeAllForUser(userId: string, at: Date): Promise<void> {
    await RefreshSessionModel.updateMany({ userId, revokedAt: null }, { $set: { revokedAt: at } });
  }

  async touchAuthenticatedAt(familyId: string, at: Date): Promise<void> {
    await RefreshSessionModel.updateMany(
      { familyId, revokedAt: null },
      { $set: { authenticatedAt: at } },
    );
  }
}
