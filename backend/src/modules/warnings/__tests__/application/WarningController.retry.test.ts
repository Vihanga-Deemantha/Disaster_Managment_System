import { AlertNotification } from '../../domain/AlertNotification';
import { createWarningsHarness, type WarningsHarness } from '../../testing/harness';
import {
  aNotification,
  aRecipient,
  aWarning,
  citizens,
  MESSAGES,
  NOW,
  result,
} from '../../testing/builders';

const OFFICER = 'usr-dmc-1';
const SECOND = 1000;

const issue = (h: WarningsHarness) =>
  h.controller.issueWarning('W-1', OFFICER, { optionalChannels: [] });

async function issued(count = 3): Promise<WarningsHarness> {
  const h = createWarningsHarness({ recipients: citizens(count) });
  await h.add();
  return h;
}

describe('UC-1 A1 / E3: WarningController.retryFailed (the Retry failed button)', () => {
  it('UC-1 A1: re-sends only the push that failed, never what was already delivered', async () => {
    const h = await issued(3);
    h.gateways.PUSH.failFor('TIMEOUT', 'c-2');
    await issue(h);
    h.gateways.PUSH.calls.length = 0;
    h.gateways.SMS.calls.length = 0;
    h.gateways.PUSH.respond(() => ({ status: 'DELIVERED' }));

    const view = await h.controller.retryFailed('W-1', OFFICER);

    expect(h.gateways.PUSH.calls.map((c) => c.recipient.citizenId)).toEqual(['c-2']);
    expect(h.gateways.PUSH.calls[0]?.notification.attemptNumber).toBe(2);
    expect(h.gateways.SMS.calls).toHaveLength(0);
    expect(view.result.byChannel.PUSH).toEqual({ sent: 3, delivered: 3, failed: 0 });
  });

  it('UC-1 A1: a retried notification no longer has a retry waiting once it has delivered', async () => {
    const h = await issued(1);
    h.gateways.PUSH.failFor('TIMEOUT', 'c-1');
    await issue(h);
    h.gateways.PUSH.respond(() => ({ status: 'DELIVERED' }));

    await h.controller.retryFailed('W-1', OFFICER);

    const [notification] = await h.notifications.findByWarning('W-1');
    expect(notification?.nextRetryAt).toBeUndefined();
    expect(notification?.overallStatus).toBe('DELIVERED');
  });

  it('UC-1 E2: after an outage ends, one press delivers everything that was waiting', async () => {
    const h = await issued(3);
    h.gateways.PUSH.goDown();
    h.gateways.SMS.goDown();
    const first = await issue(h);
    expect(first.result.pendingRetry).toBe(3);
    h.gateways.PUSH.available = true;
    h.gateways.SMS.available = true;

    const view = await h.controller.retryFailed('W-1', OFFICER);

    expect(view.allChannelsUnavailable).toBe(false);
    expect(view.result).toMatchObject({ targeted: 3, reached: 3, pendingRetry: 0, failed: 0 });
    expect(view.result.byChannel.PUSH).toEqual({ sent: 3, delivered: 3, failed: 0 });
  });

  it('UC-1 E3: tries again straight away, whatever back-off the automatic retry is waiting for', async () => {
    const h = await issued(1);
    h.gateways.SMS.goDown();
    h.gateways.PUSH.goDown();
    await issue(h);
    h.gateways.SMS.available = true;
    h.gateways.PUSH.available = true;

    const view = await h.controller.retryFailed('W-1', OFFICER);

    expect(view.result.reached).toBe(1);
  });

  it('UC-1 E3: keeps trying for the officer even after the automatic retries ran out', async () => {
    const h = await issued(1);
    h.gateways.SMS.respond(() => ({ status: 'FAILED', errorCode: 'TIMEOUT' }));
    h.gateways.PUSH.respond(() => ({ status: 'FAILED', errorCode: 'TIMEOUT' }));
    await issue(h);
    for (let press = 0; press < 3; press += 1) await h.controller.retryFailed('W-1', OFFICER);
    const exhausted = await h.controller.getDelivery('W-1');
    expect(exhausted.result).toMatchObject({ failed: 1, pendingRetry: 0 });

    h.gateways.SMS.respond(() => ({ status: 'DELIVERED' }));
    const view = await h.controller.retryFailed('W-1', OFFICER);

    expect(view.result).toMatchObject({ reached: 1, failed: 0 });
  });

  it('UC-1 E2: citizens no channel can reach are skipped, there is nothing to send them', async () => {
    const h = createWarningsHarness({
      recipients: [aRecipient({ citizenId: 'c-1', deviceToken: undefined, phone: undefined })],
    });
    await h.add();
    await issue(h);

    const view = await h.controller.retryFailed('W-1', OFFICER);

    expect(view.result).toMatchObject({ targeted: 1, failed: 1 });
    expect(h.gateways.PUSH.calls).toHaveLength(0);
    expect(h.gateways.SMS.calls).toHaveLength(0);
  });

  it('UC-1 E3: skips a citizen who is no longer registered in the area', async () => {
    const h = await issued(1);
    h.gateways.PUSH.goDown();
    h.gateways.SMS.goDown();
    await issue(h);
    h.gateways.PUSH.available = true;
    h.gateways.SMS.available = true;
    jest.spyOn(h.directory, 'findInArea').mockResolvedValue([]);

    const view = await h.controller.retryFailed('W-1', OFFICER);

    expect(h.gateways.PUSH.calls).toHaveLength(0);
    expect(view.result.pendingRetry).toBe(1);
  });

  it('UC-1 BR4: audits the retry with how many notifications it covered', async () => {
    const h = await issued(2);
    h.gateways.PUSH.failFor('TIMEOUT', 'c-1');
    await issue(h);

    await h.controller.retryFailed('W-1', OFFICER);

    expect(h.audit.find('warning.retried')).toMatchObject({
      actorId: OFFICER,
      subjectId: 'W-1',
      details: { notifications: 1 },
    });
  });

  it('UC-1: a warning that has not been issued has nothing to retry', async () => {
    const h = await issued(1);

    await expect(h.controller.retryFailed('W-1', OFFICER)).rejects.toMatchObject({
      code: 'WARNING_NOT_ISSUED',
      kind: 'CONFLICT',
      message: 'Only an issued warning has deliveries to retry.',
    });
  });

  it('UC-1: reports an unknown warning as not found', async () => {
    await expect(
      createWarningsHarness().controller.retryFailed('nope', OFFICER),
    ).rejects.toMatchObject({
      code: 'WARNING_NOT_FOUND',
    });
  });
});

describe('UC-1 E3: WarningController.retryDue (the automatic retry)', () => {
  it('UC-1 E3: retries nothing before the back-off has passed', async () => {
    const h = await issued(2);
    h.gateways.PUSH.goDown();
    h.gateways.SMS.goDown();
    await issue(h);
    h.gateways.PUSH.available = true;
    h.gateways.SMS.available = true;
    h.clock.advance(29 * SECOND);

    expect(await h.controller.retryDue()).toBe(0);
    expect(h.gateways.PUSH.calls).toHaveLength(0);
  });

  it('UC-1 E3: retries what is due as soon as the back-off has passed, and delivers it', async () => {
    const h = await issued(2);
    h.gateways.PUSH.goDown();
    h.gateways.SMS.goDown();
    await issue(h);
    h.gateways.PUSH.available = true;
    h.gateways.SMS.available = true;
    h.clock.advance(30 * SECOND);

    expect(await h.controller.retryDue()).toBe(2);

    const view = await h.controller.getDelivery('W-1');
    expect(view.result).toMatchObject({ reached: 2, pendingRetry: 0 });
  });

  it('UC-1 A1: retries only the channel that is still within its budget, not the ones that gave up', async () => {
    const h = await issued(1);
    h.gateways.PUSH.respond(() => ({ status: 'FAILED', errorCode: 'TIMEOUT' }));
    await issue(h);
    for (let round = 0; round < 3; round += 1) {
      h.clock.advance(10 * 60_000);
      await h.controller.retryDue();
    }
    const pushCalls = h.gateways.PUSH.calls.length;
    expect(pushCalls).toBe(4);

    h.clock.advance(60 * 60_000);

    expect(await h.controller.retryDue()).toBe(0);
    expect(h.gateways.PUSH.calls).toHaveLength(pushCalls);
  });

  it('UC-1 E3: leaves alone a notification that has no retry due, and a warning that is not issued', async () => {
    const h = await issued(1);
    await h.add(aWarning({ warningId: 'W-2' }));
    await issue(h);
    h.clock.advance(60 * 60_000);

    expect(await h.controller.retryDue()).toBe(0);
  });

  it('UC-1 E3: does not look up the citizens of a warning when nothing of it is due', async () => {
    const h = await issued(2);
    h.gateways.PUSH.goDown();
    h.gateways.SMS.goDown();
    await issue(h);
    h.clock.advance(29 * SECOND);
    const lookup = jest.spyOn(h.directory, 'findInArea');

    await h.controller.retryDue();

    expect(lookup).not.toHaveBeenCalled();
  });

  it('UC-1 E3: covers every issued warning', async () => {
    const h = createWarningsHarness({ recipients: citizens(1) });
    await h.add(aWarning({ warningId: 'W-1' }));
    await h.add(aWarning({ warningId: 'W-2' }));
    h.gateways.SMS.goDown();
    h.gateways.PUSH.goDown();
    await h.controller.issueWarning('W-1', OFFICER, { optionalChannels: [] });
    await h.controller.issueWarning('W-2', OFFICER, { optionalChannels: [] });
    h.gateways.SMS.available = true;
    h.gateways.PUSH.available = true;
    h.clock.advance(30 * SECOND);

    expect(await h.controller.retryDue()).toBe(2);
  });

  it('UC-1 E3: skips a due notification whose citizen is gone', async () => {
    const h = createWarningsHarness({ recipients: citizens(1) });
    await h.add();
    h.gateways.SMS.goDown();
    h.gateways.PUSH.goDown();
    await issue(h);
    h.clock.advance(30 * SECOND);
    jest.spyOn(h.directory, 'findInArea').mockResolvedValue([]);

    expect(await h.controller.retryDue()).toBe(0);
  });
});

describe('UC-1 step 14: WarningController.getDelivery', () => {
  it('UC-1 step 14: gives the summary of an issued warning', async () => {
    const h = await issued(2);
    h.gateways.PUSH.failFor('TIMEOUT', 'c-1');
    await issue(h);

    const view = await h.controller.getDelivery('W-1');

    expect(view.warning.status).toBe('ISSUED');
    expect(view.result.byChannel.PUSH).toEqual({ sent: 2, delivered: 1, failed: 1 });
    expect(view.allChannelsUnavailable).toBe(false);
  });

  it('UC-1 E2: says when every gateway was down', async () => {
    const h = await issued(1);
    h.gateways.PUSH.goDown();
    h.gateways.SMS.goDown();
    await issue(h);

    expect((await h.controller.getDelivery('W-1')).allChannelsUnavailable).toBe(true);
  });

  it('UC-1 step 14: a warning that was never issued has an empty summary', async () => {
    const h = await issued(1);

    expect((await h.controller.getDelivery('W-1')).result.targeted).toBe(0);
  });

  it('UC-1: reports an unknown warning as not found', async () => {
    await expect(createWarningsHarness().controller.getDelivery('nope')).rejects.toMatchObject({
      code: 'WARNING_NOT_FOUND',
    });
  });
});

describe('UC-1 E2: WarningController.listUnreached (the follow-up list)', () => {
  it('UC-1 E2: lists the citizens who were not reached, with where to find them and why', async () => {
    const h = createWarningsHarness({
      recipients: [
        aRecipient({ citizenId: 'ok', fullName: 'Reached Citizen' }),
        aRecipient({
          citizenId: 'down',
          fullName: 'Pending Citizen',
          addressLine: '5 Lake Road',
          preferredLanguage: 'TA',
        }),
        aRecipient({
          citizenId: 'none',
          fullName: 'Nobody Citizen',
          deviceToken: undefined,
          phone: undefined,
        }),
      ],
    });
    await h.add();
    h.gateways.SMS.respond((call) =>
      call.recipient.citizenId === 'down'
        ? { status: 'FAILED', errorCode: 'CARRIER_REJECTED' }
        : null,
    );
    h.gateways.PUSH.respond((call) =>
      call.recipient.citizenId === 'down'
        ? { status: 'FAILED', errorCode: 'DEVICE_UNREACHABLE' }
        : null,
    );
    await issue(h);

    const list = await h.controller.listUnreached('W-1');

    expect(list).toStrictEqual([
      {
        citizenId: 'down',
        fullName: 'Pending Citizen',
        phone: '+94771234567',
        addressLine: '5 Lake Road',
        district: 'GAMPAHA',
        language: 'TA',
        status: 'PENDING_RETRY',
        reason: 'DEVICE_UNREACHABLE',
      },
      {
        citizenId: 'none',
        fullName: 'Nobody Citizen',
        district: 'GAMPAHA',
        language: 'EN',
        status: 'FAILED',
        reason: 'NO_CHANNEL',
      },
    ]);
  });

  it('UC-1 E2: names the gateway outage when the gateway was simply down', async () => {
    const h = await issued(1);
    h.gateways.PUSH.goDown();
    h.gateways.SMS.goDown();
    await issue(h);

    expect((await h.controller.listUnreached('W-1'))[0]).toMatchObject({
      status: 'PENDING_RETRY',
      reason: 'GATEWAY_DOWN',
    });
  });

  it('UC-1 E2: names the status when a stored attempt has no error code', async () => {
    const h = await issued(1);
    const notification = aNotification({ citizenId: 'c-1' });
    notification.recordAttempts([result('SMS', 'FAILED')], NOW, 3);
    await h.notifications.insertMany([notification]);

    expect((await h.controller.listUnreached('W-1'))[0]).toMatchObject({
      status: 'PENDING_RETRY',
      reason: 'FAILED',
    });
  });

  it('UC-1 E2: leaves out everyone who was delivered to', async () => {
    const h = await issued(3);
    await issue(h);

    expect(await h.controller.listUnreached('W-1')).toEqual([]);
  });

  it('UC-1 E2: does not invent a reason for a notification nobody has tried yet', async () => {
    const h = await issued(1);
    await h.notifications.insertMany([
      AlertNotification.create(
        {
          notificationId: 'N-x',
          warningId: 'W-1',
          citizenId: 'c-1',
          language: 'EN',
          content: MESSAGES.EN,
        },
        NOW,
      ),
    ]);

    expect((await h.controller.listUnreached('W-1'))[0]?.reason).toBe('UNKNOWN');
  });

  it('UC-1 E2: leaves out a citizen who is no longer registered, since there is nobody to visit', async () => {
    const h = await issued(1);
    h.gateways.PUSH.goDown();
    h.gateways.SMS.goDown();
    await issue(h);
    jest.spyOn(h.directory, 'findInArea').mockResolvedValue([]);

    expect(await h.controller.listUnreached('W-1')).toEqual([]);
  });

  it('UC-1: reports an unknown warning as not found', async () => {
    await expect(createWarningsHarness().controller.listUnreached('nope')).rejects.toMatchObject({
      code: 'WARNING_NOT_FOUND',
    });
  });
});
