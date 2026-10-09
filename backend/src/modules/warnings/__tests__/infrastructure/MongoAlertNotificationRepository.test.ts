import { clearDatabase, connectTestMongo } from '@shared/testing/mongo';
import { AlertNotification } from '../../domain/AlertNotification';
import { MongoAlertNotificationRepository } from '../../infrastructure/MongoAlertNotificationRepository';
import { AlertNotificationModel } from '../../infrastructure/models';
import { aNotification, MINUTE, NOW, result } from '../../testing/builders';

let teardown: () => Promise<void>;
const repository = new MongoAlertNotificationRepository();

beforeAll(async () => {
  teardown = await connectTestMongo();
  await AlertNotificationModel.init();
});
afterAll(async () => teardown());
beforeEach(async () => clearDatabase());

const at = (minutes: number): Date => new Date(NOW.getTime() + minutes * MINUTE);

describe('UC-1 persistence: MongoAlertNotificationRepository', () => {
  it('stores notifications and reads them back with every attempt', async () => {
    const delivered = aNotification({ id: 'N-1', citizenId: 'c-1' });
    delivered.recordAttempts(
      [result('PUSH', 'FAILED', 'TIMEOUT'), result('SMS', 'DELIVERED')],
      at(1),
      3,
    );
    delivered.scheduleRetryAt(at(2));

    await repository.insertMany([delivered]);

    const [stored] = await repository.findByWarning('W-1');
    expect(stored?.snapshot()).toEqual(delivered.snapshot());
  });

  it('stores an unreachable citizen too, so the follow-up list can show them', async () => {
    const unreachable = AlertNotification.unreachable(
      { notificationId: 'N-2', warningId: 'W-1', citizenId: 'c-2', language: 'SI', content: 'x' },
      NOW,
    );

    await repository.insertMany([unreachable]);

    const [stored] = await repository.findByWarning('W-1');
    expect(stored?.isUnreachable).toBe(true);
    expect(stored?.overallStatus).toBe('FAILED');
  });

  it('lists a warning’s notifications oldest first and never another warning’s', async () => {
    const late = AlertNotification.create(
      { notificationId: 'N-b', warningId: 'W-1', citizenId: 'c-b', language: 'EN', content: 'x' },
      at(5),
    );
    const early = AlertNotification.create(
      { notificationId: 'N-a', warningId: 'W-1', citizenId: 'c-a', language: 'EN', content: 'x' },
      at(1),
    );
    const other = aNotification({ id: 'N-z', citizenId: 'c-z', warningId: 'W-2' });

    await repository.insertMany([late, early, other]);

    expect((await repository.findByWarning('W-1')).map((n) => n.notificationId)).toEqual([
      'N-a',
      'N-b',
    ]);
    expect((await repository.findByWarning('W-2')).map((n) => n.notificationId)).toEqual(['N-z']);
    expect(await repository.findByWarning('W-3')).toEqual([]);
  });

  it('replaces what is stored with the current state, and creates what is missing', async () => {
    const existing = aNotification({ id: 'N-1', citizenId: 'c-1' });
    await repository.insertMany([existing]);
    existing.recordAttempts([result('PUSH', 'DELIVERED'), result('SMS', 'DELIVERED')], at(1), 3);
    const brandNew = aNotification({ id: 'N-2', citizenId: 'c-2' });

    await repository.saveMany([existing, brandNew]);

    const stored = await repository.findByWarning('W-1');
    expect(stored).toHaveLength(2);
    expect(stored.find((n) => n.notificationId === 'N-1')?.overallStatus).toBe('DELIVERED');
    expect(stored.find((n) => n.notificationId === 'N-2')?.latestAttempts()).toEqual([]);
  });

  it('removes a retry time that is no longer due when the notification is saved again', async () => {
    const notification = aNotification();
    notification.scheduleRetryAt(at(3));
    await repository.insertMany([notification]);

    notification.scheduleRetryAt(undefined);
    await repository.saveMany([notification]);

    expect((await repository.findByWarning('W-1'))[0]?.nextRetryAt).toBeUndefined();
  });

  it('does nothing, without error, when there is nothing to store', async () => {
    await expect(repository.insertMany([])).resolves.toBeUndefined();
    await expect(repository.saveMany([])).resolves.toBeUndefined();
    expect(await AlertNotificationModel.countDocuments()).toBe(0);
  });

  it('refuses a second notification for the same citizen and warning, so nobody is alerted twice', async () => {
    await repository.insertMany([aNotification({ id: 'N-1', citizenId: 'c-1' })]);

    await expect(
      repository.insertMany([aNotification({ id: 'N-2', citizenId: 'c-1' })]),
    ).rejects.toMatchObject({ code: 11000 });
  });

  it('allows the same citizen to be alerted about a different warning', async () => {
    await repository.insertMany([aNotification({ id: 'N-1', citizenId: 'c-1', warningId: 'W-1' })]);

    await expect(
      repository.insertMany([aNotification({ id: 'N-2', citizenId: 'c-1', warningId: 'W-2' })]),
    ).resolves.toBeUndefined();
  });
});

describe('UC-1 citizen inbox: MongoAlertNotificationRepository.findDeliveredByCitizen', () => {
  const sent = (id: string, citizenId: string, warningId: string, minutes: number) => {
    const notification = AlertNotification.create(
      { notificationId: id, warningId, citizenId, language: 'EN', content: `text ${id}` },
      at(minutes),
    );
    notification.recordAttempts([result('SMS', 'DELIVERED')], at(minutes), 3);
    return notification;
  };

  it('lists this citizen’s delivered alerts, newest first, with their attempts', async () => {
    await repository.insertMany([
      sent('N-old', 'c-1', 'W-1', 1),
      sent('N-new', 'c-1', 'W-2', 9),
      sent('N-mid', 'c-1', 'W-3', 5),
    ]);

    const inbox = await repository.findDeliveredByCitizen('c-1', 10);

    expect(inbox.map((n) => n.notificationId)).toEqual(['N-new', 'N-mid', 'N-old']);
    expect(inbox[0]?.deliveredAt()).toEqual(at(9));
    expect(inbox[0]?.content).toBe('text N-new');
  });

  it('never lists another citizen’s alerts', async () => {
    await repository.insertMany([sent('N-1', 'c-1', 'W-1', 1), sent('N-2', 'c-2', 'W-1', 1)]);

    expect(
      (await repository.findDeliveredByCitizen('c-2', 10)).map((n) => n.notificationId),
    ).toEqual(['N-2']);
    expect(await repository.findDeliveredByCitizen('c-3', 10)).toEqual([]);
  });

  it('leaves out what has not got through: waiting for a retry, failed, or unreachable', async () => {
    const waiting = aNotification({ id: 'N-wait', citizenId: 'c-1', warningId: 'W-1' });
    const failed = aNotification({ id: 'N-fail', citizenId: 'c-1', warningId: 'W-2' });
    for (let attempt = 0; attempt < 4; attempt += 1) {
      failed.recordAttempts([result('SMS', 'FAILED')], at(1), 3);
    }
    waiting.recordAttempts([result('SMS', 'FAILED')], at(1), 3);
    const unreachable = AlertNotification.unreachable(
      {
        notificationId: 'N-none',
        warningId: 'W-3',
        citizenId: 'c-1',
        language: 'SI',
        content: 'x',
      },
      at(1),
    );
    await repository.insertMany([waiting, failed, unreachable, sent('N-ok', 'c-1', 'W-4', 2)]);

    expect(
      (await repository.findDeliveredByCitizen('c-1', 10)).map((n) => n.notificationId),
    ).toEqual(['N-ok']);
  });

  it('includes an alert that reached the citizen on one channel while another still waits', async () => {
    const partial = aNotification({ id: 'N-1', citizenId: 'c-1' });
    partial.recordAttempts([result('PUSH', 'FAILED'), result('SMS', 'DELIVERED')], at(1), 3);
    await repository.insertMany([partial]);

    expect(await repository.findDeliveredByCitizen('c-1', 10)).toHaveLength(1);
  });

  it('stops at the limit, keeping the newest', async () => {
    await repository.insertMany([
      sent('N-1', 'c-1', 'W-1', 1),
      sent('N-2', 'c-1', 'W-2', 2),
      sent('N-3', 'c-1', 'W-3', 3),
    ]);

    expect(
      (await repository.findDeliveredByCitizen('c-1', 2)).map((n) => n.notificationId),
    ).toEqual(['N-3', 'N-2']);
  });

  it('breaks a tie in creation time by id, so the order never changes between calls', async () => {
    await repository.insertMany([sent('N-b', 'c-1', 'W-1', 4), sent('N-a', 'c-1', 'W-2', 4)]);

    expect(
      (await repository.findDeliveredByCitizen('c-1', 10)).map((n) => n.notificationId),
    ).toEqual(['N-a', 'N-b']);
  });

  it('is served by an index that starts with the citizen, not by reading every notification', async () => {
    const indexes = await AlertNotificationModel.collection.indexes();

    expect(indexes.map((index) => index.key)).toContainEqual({
      citizenId: 1,
      overallStatus: 1,
      createdAt: -1,
    });
  });
});
