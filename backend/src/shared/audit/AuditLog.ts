import mongoose, { Schema } from 'mongoose';
import type { Role } from '../contracts/enums';

/** Who did what, when and why (BR4). Append-only: nothing in the app edits or deletes entries. */
export interface AuditEntry {
  /** Dotted verb, e.g. `warning.issued`, `auth.login.failure`. */
  action: string;
  actorId?: string;
  actorRole?: Role;
  subjectType?: string;
  subjectId?: string;
  reason?: string;
  details?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
  occurredAt: Date;
}

export interface AuditLog {
  record(entry: AuditEntry): Promise<void>;
}

const SENSITIVE_KEY = /pass(word)?|token|secret|nic|authorization|cookie/i;

/** Defence in depth: whatever a caller passes, secrets never reach the audit trail. */
export function sanitizeAuditDetails(details: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(details).map(([key, value]) => [
      key,
      SENSITIVE_KEY.test(key) ? '[redacted]' : value,
    ]),
  );
}

/** For tests and local runs without a database. */
export class InMemoryAuditLog implements AuditLog {
  readonly entries: AuditEntry[] = [];

  async record(entry: AuditEntry): Promise<void> {
    this.entries.push(entry);
  }
}

const auditSchema = new Schema(
  {
    action: { type: String, required: true, index: true },
    actorId: { type: String, index: true },
    actorRole: String,
    subjectType: String,
    subjectId: { type: String, index: true },
    reason: String,
    details: Schema.Types.Mixed,
    ip: String,
    userAgent: String,
    occurredAt: { type: Date, required: true, index: true },
  },
  { collection: 'audit_logs', versionKey: false },
);

const AuditModel = mongoose.model<AuditEntry>('AuditLogEntry', auditSchema);

export class MongoAuditLog implements AuditLog {
  async record(entry: AuditEntry): Promise<void> {
    const details = entry.details ? sanitizeAuditDetails(entry.details) : undefined;
    await AuditModel.create({ ...entry, ...(details ? { details } : {}) });
  }
}
