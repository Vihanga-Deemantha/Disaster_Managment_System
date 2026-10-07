import mongoose from 'mongoose';
import { clearDatabase, connectTestMongo } from '../../testing/mongo';
import { FakeAuditLog } from '../../testing/FakeAuditLog';
import {
  InMemoryAuditLog,
  MongoAuditLog,
  sanitizeAuditDetails,
  type AuditEntry,
} from '../AuditLog';

const entry: AuditEntry = {
  action: 'warning.issued',
  actorId: 'officer-1',
  actorRole: 'DMC_OFFICER',
  subjectType: 'warning',
  subjectId: 'w-1',
  reason: 'Flood warning approved',
  ip: '203.0.113.7',
  userAgent: 'jest',
  occurredAt: new Date('2026-10-07T09:00:00.000Z'),
};

describe('sanitizeAuditDetails (BR4: log who, what, why, never secrets)', () => {
  it('redacts anything that looks like a password, token, secret, NIC or credential header', () => {
    const cleaned = sanitizeAuditDetails({
      password: 'p',
      currentPassword: 'p',
      refreshToken: 't',
      apiSecret: 's',
      nic: 'n',
      authorization: 'a',
      cookie: 'c',
      recipients: 120,
      area: 'Gampaha',
    });

    expect(cleaned).toEqual({
      password: '[redacted]',
      currentPassword: '[redacted]',
      refreshToken: '[redacted]',
      apiSecret: '[redacted]',
      nic: '[redacted]',
      authorization: '[redacted]',
      cookie: '[redacted]',
      recipients: 120,
      area: 'Gampaha',
    });
  });

  it('leaves an empty details object empty', () => {
    expect(sanitizeAuditDetails({})).toEqual({});
  });
});

describe('InMemoryAuditLog and FakeAuditLog', () => {
  it('keeps entries in order and lets tests query them', async () => {
    const log = new FakeAuditLog();

    await log.record(entry);
    await log.record({ ...entry, action: 'warning.rejected' });

    expect(log.actions()).toEqual(['warning.issued', 'warning.rejected']);
    expect(log.find('warning.rejected')?.action).toBe('warning.rejected');
    expect(log.find('nothing')).toBeUndefined();
    expect(new InMemoryAuditLog().entries).toEqual([]);
  });
});

describe('MongoAuditLog', () => {
  let teardown: () => Promise<void>;
  const log = new MongoAuditLog();
  const collection = () => mongoose.connection.collection('audit_logs');

  beforeAll(async () => {
    teardown = await connectTestMongo();
  });
  afterAll(async () => teardown());
  beforeEach(async () => clearDatabase());

  it('appends an entry with every field', async () => {
    await log.record({ ...entry, details: { recipients: 120 } });

    const [stored] = await collection().find().toArray();
    expect(stored).toMatchObject({
      action: 'warning.issued',
      actorId: 'officer-1',
      actorRole: 'DMC_OFFICER',
      subjectType: 'warning',
      subjectId: 'w-1',
      reason: 'Flood warning approved',
      ip: '203.0.113.7',
      userAgent: 'jest',
      occurredAt: entry.occurredAt,
      details: { recipients: 120 },
    });
  });

  it('records an entry with no details', async () => {
    await log.record({ action: 'auth.logout', occurredAt: entry.occurredAt });

    expect(await collection().countDocuments()).toBe(1);
    expect((await collection().findOne())?.details).toBeUndefined();
  });

  it('strips secrets from details even if a caller passes them', async () => {
    await log.record({ ...entry, details: { password: 'hunter2', channel: 'SMS' } });

    const stored = JSON.stringify(await collection().findOne());
    expect(stored).not.toContain('hunter2');
    expect(stored).toContain('"channel":"SMS"');
  });

  it('refuses an entry without an action or a time', async () => {
    await expect(log.record({ occurredAt: entry.occurredAt } as AuditEntry)).rejects.toThrow();
    await expect(log.record({ action: 'x' } as AuditEntry)).rejects.toThrow();
  });
});
