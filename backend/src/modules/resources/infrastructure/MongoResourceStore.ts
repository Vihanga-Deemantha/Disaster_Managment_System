import mongoose, { Schema, type ClientSession } from 'mongoose';
import { NotFoundError } from '@shared/errors';
import { sanitizeAuditDetails, type AuditEntry } from '@shared/audit/AuditLog';
import type { Records, ResourceStore, ResourceUnitOfWork } from '../application/ports';

// Snapshots retain domain types (including BSON dates); mutations always go through the entities.
interface Snapshot<K extends keyof Records> {
  _id: string;
  data: Records[K];
}
function model<K extends keyof Records>(kind: K) {
  const name = `Resource_${kind}`;
  const schema = new Schema<Snapshot<K>>(
    { _id: String, data: { type: Schema.Types.Mixed, required: true } },
    { collection: `resource_${kind}`, versionKey: false },
  );
  return (
    (mongoose.models[name] as mongoose.Model<Snapshot<K>> | undefined) ??
    mongoose.model<Snapshot<K>>(name, schema)
  );
}
export class MongoResourceStore implements ResourceStore {
  constructor(private readonly session?: ClientSession) {}

  async get<K extends keyof Records>(kind: K, id: string): Promise<Records[K]> {
    const doc = await model(kind)
      .findById(id)
      .session(this.session ?? null)
      .lean<Snapshot<K>>();
    if (!doc) throw new NotFoundError('RESOURCE_RECORD_NOT_FOUND', `${kind} record not found.`);
    return doc.data;
  }
  async list<K extends keyof Records>(kind: K): Promise<Records[K][]> {
    const docs = await model(kind)
      .find()
      .session(this.session ?? null)
      .lean<Snapshot<K>[]>();
    return docs.map((doc) => doc.data);
  }
  async save<K extends keyof Records>(kind: K, id: string, data: Records[K]): Promise<void> {
    await model(kind).replaceOne(
      { _id: id },
      { _id: id, data },
      { upsert: true, session: this.session },
    );
  }
  async audit(entry: AuditEntry): Promise<void> {
    const details = entry.details ? sanitizeAuditDetails(entry.details) : undefined;
    await mongoose
      .model<AuditEntry>('AuditLogEntry')
      .create([{ ...entry, details }], { session: this.session });
  }
}
export class MongoResourceUnitOfWork implements ResourceUnitOfWork {
  async run<T>(work: (store: ResourceStore) => Promise<T>): Promise<T> {
    const session = await mongoose.startSession();
    try {
      // Driver retries write conflicts with fresh reads, including both stock and outstanding need.
      return await session.withTransaction(() => work(new MongoResourceStore(session)));
    } finally {
      await session.endSession();
    }
  }
}
