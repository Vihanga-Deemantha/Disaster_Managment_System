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
