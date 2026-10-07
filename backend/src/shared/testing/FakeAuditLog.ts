import { InMemoryAuditLog, type AuditEntry } from '../audit/AuditLog';

/** Test audit log: query what was recorded instead of inspecting a database. */
export class FakeAuditLog extends InMemoryAuditLog {
  actions(): string[] {
    return this.entries.map((entry) => entry.action);
  }

  find(action: string): AuditEntry | undefined {
    return this.entries.find((entry) => entry.action === action);
  }
}
