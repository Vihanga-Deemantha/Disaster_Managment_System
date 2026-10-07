import { DuplicateError, type UserRepository } from '../application/ports';
import type { User } from '../domain/types';
import { UserModel, type UserDoc } from './models';

const DUPLICATE_KEY = 11000;
type DuplicateField = DuplicateError['field'];
const DUPLICATE_FIELDS: readonly string[] = ['phone', 'email', 'nicHash'];

/** Turns a MongoDB unique-index violation into the port's `DuplicateError`; anything else passes through. */
export function asDuplicateError(error: unknown): unknown {
  const details = error as { code?: unknown; keyPattern?: Record<string, unknown> };
  if (details?.code !== DUPLICATE_KEY) return error;
  const field = Object.keys(details.keyPattern ?? {}).find((key) => DUPLICATE_FIELDS.includes(key));
  return field ? new DuplicateError(field as DuplicateField) : error;
}

function toUser(doc: UserDoc): User {
  return {
    userId: doc._id,
    role: doc.role,
    displayName: doc.displayName,
    email: doc.email,
    phone: doc.phone,
    passwordHash: doc.passwordHash,
    status: doc.status,
    organizationId: doc.organizationId,
    organizationType: doc.organizationType,
    district: doc.district,
    createdAt: doc.createdAt,
  };
}

export class MongoUserRepository implements UserRepository {
  async findById(userId: string): Promise<User | null> {
    const doc = await UserModel.findById(userId).lean();
    return doc ? toUser(doc) : null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const doc = await UserModel.findOne({ email }).lean();
    return doc ? toUser(doc) : null;
  }

  async findByPhone(phone: string): Promise<User | null> {
    const doc = await UserModel.findOne({ phone }).lean();
    return doc ? toUser(doc) : null;
  }

  async create(user: User): Promise<void> {
    const { userId, ...rest } = user;
    try {
      await UserModel.create({ _id: userId, ...rest });
    } catch (error) {
      throw asDuplicateError(error);
    }
  }

  async updatePasswordHash(userId: string, passwordHash: string): Promise<void> {
    await UserModel.updateOne({ _id: userId }, { $set: { passwordHash } });
  }

  async delete(userId: string): Promise<void> {
    await UserModel.deleteOne({ _id: userId });
  }
}
