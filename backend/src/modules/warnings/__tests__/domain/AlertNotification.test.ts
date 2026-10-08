import { AlertNotification } from '../../domain/AlertNotification';
import { aNotification, MESSAGES, MINUTE, NOW, result } from '../../testing/builders';

const MAX = 3;
const later = (ms: number): Date => new Date(NOW.getTime() + ms);

describe('UC-1 step 9: AlertNotification.create', () => {
  it('UC-1 step 9: starts waiting, with no attempts, in the citizen’s language', () => {
    const notification = aNotification();

    expect(notification.overallStatus).toBe('PENDING_RETRY');
    expect(notification.isReached()).toBe(false);
    expect(notification.latestAttempts()).toEqual([]);
    expect(notification.snapshot()).toMatchObject({
      notificationId: 'N-1',
      warningId: 'W-1',
      citizenId: 'citizen-1',
      language: 'EN',
      content: MESSAGES.EN,
      unreachable: false,
      createdAt: NOW,
    });
  });

  it('SD1-04: exposes who and what it is for', () => {
    const notification = aNotification({ id: 'N-9', citizenId: 'c-9', warningId: 'W-9' });

    expect(notification.notificationId).toBe('N-9');
    expect(notification.citizenId).toBe('c-9');
    expect(notification.warningId).toBe('W-9');
    expect(notification.language).toBe('EN');
    expect(notification.content).toBe(MESSAGES.EN);
    expect(notification.isUnreachable).toBe(false);
  });
});

describe('UC-1 step 12 / CD-11: AlertNotification.recordAttempts', () => {
  it('UC-1 step 12: push and SMS both delivered means delivered', () => {
    const notification = aNotification();

    notification.recordAttempts(
      [result('PUSH', 'DELIVERED'), result('SMS', 'DELIVERED')],
      NOW,
      MAX,
    );

    expect(notification.overallStatus).toBe('DELIVERED');
    expect(notification.isReached()).toBe(true);
    expect(notification.needsRetry(MAX)).toBe(false);
  });

  it('UC-1 step 12: keeps one stamped attempt per channel, with the error code when there is one', () => {
    const notification = aNotification();

    notification.recordAttempts(
      [result('PUSH', 'FAILED', 'GATEWAY_ERROR'), result('SMS', 'DELIVERED')],
      later(MINUTE),
      MAX,
    );

    expect(notification.snapshot().attempts).toEqual([
      { channel: 'PUSH', status: 'FAILED', attemptedAt: later(MINUTE), errorCode: 'GATEWAY_ERROR' },
      { channel: 'SMS', status: 'DELIVERED', attemptedAt: later(MINUTE) },
    ]);
    expect(notification.snapshot().updatedAt).toEqual(later(MINUTE));
  });

  it('UC-1 A1: push failed but SMS delivered still counts as reached, and the push is retried', () => {
    const notification = aNotification();

    notification.recordAttempts(
      [result('PUSH', 'FAILED', 'TIMEOUT'), result('SMS', 'DELIVERED')],
      NOW,
      MAX,
    );

    expect(notification.isReached()).toBe(true);
    expect(notification.overallStatus).toBe('DELIVERED');
    expect(notification.needsRetry(MAX)).toBe(true);
    expect(notification.retryChannels(MAX)).toEqual(['PUSH']);
  });

  it('UC-1 A1: a failed push that is later delivered stops needing a retry', () => {
    const notification = aNotification();
    notification.recordAttempts([result('PUSH', 'FAILED'), result('SMS', 'DELIVERED')], NOW, MAX);

    notification.recordAttempts([result('PUSH', 'DELIVERED')], later(MINUTE), MAX);

    expect(notification.needsRetry(MAX)).toBe(false);
    expect(notification.unsettledChannels()).toEqual([]);
  });

  it('UC-1 A1: nothing delivered yet and retries left means pending retry', () => {
    const notification = aNotification();

    notification.recordAttempts([result('PUSH', 'FAILED'), result('SMS', 'FAILED')], NOW, MAX);

    expect(notification.overallStatus).toBe('PENDING_RETRY');
    expect(notification.retryChannels(MAX)).toEqual(['PUSH', 'SMS']);
  });

  it('UC-1 A1: allows the first try and exactly three retries, then gives up', () => {
    const notification = aNotification();
    const statuses: string[] = [];
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      notification.recordAttempts([result('SMS', 'FAILED')], later(attempt * MINUTE), MAX);
      statuses.push(notification.overallStatus);
    }

    expect(statuses).toEqual(['PENDING_RETRY', 'PENDING_RETRY', 'PENDING_RETRY', 'FAILED']);
    expect(notification.needsRetry(MAX)).toBe(false);
  });

  it('UC-1 A1: a bigger budget keeps retrying for longer', () => {
    const notification = aNotification();
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      notification.recordAttempts([result('SMS', 'FAILED')], NOW, 5);
    }

    expect(notification.overallStatus).toBe('PENDING_RETRY');
  });

  it('UC-1 E2: a gateway that was down is pending, not failed, and never uses up the budget', () => {
    const notification = aNotification();
    for (let attempt = 1; attempt <= 10; attempt += 1) {
      notification.recordAttempts(
        [result('PUSH', 'UNAVAILABLE'), result('SMS', 'UNAVAILABLE')],
        NOW,
        MAX,
      );
    }

    expect(notification.overallStatus).toBe('PENDING_RETRY');
    expect(notification.retryChannels(MAX)).toEqual(['PUSH', 'SMS']);
  });

  it('UC-1 E2: real failures after an outage still count from the first one', () => {
    const notification = aNotification();
    notification.recordAttempts([result('SMS', 'UNAVAILABLE')], NOW, MAX);
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      notification.recordAttempts([result('SMS', 'FAILED')], NOW, MAX);
    }

    expect(notification.overallStatus).toBe('FAILED');
  });

  it('UC-1 A1: a channel that gave up does not stop another channel being retried', () => {
    const notification = aNotification();
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      notification.recordAttempts([result('PUSH', 'FAILED')], NOW, MAX);
    }
    notification.recordAttempts([result('SMS', 'UNAVAILABLE')], NOW, MAX);

    expect(notification.retryChannels(MAX)).toEqual(['SMS']);
    expect(notification.overallStatus).toBe('PENDING_RETRY');
  });

  it('UC-1 A1: each channel has a retry budget of its own', () => {
    const notification = aNotification();
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      notification.recordAttempts([result('PUSH', 'FAILED')], NOW, MAX);
    }
    notification.recordAttempts([result('SMS', 'FAILED')], NOW, MAX);

    expect(notification.retryChannels(MAX)).toEqual(['SMS']);
    expect(notification.overallStatus).toBe('PENDING_RETRY');
  });

  it('UC-1 E2: a gateway that goes down after real failures is still worth another go', () => {
    const notification = aNotification();
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      notification.recordAttempts([result('PUSH', 'FAILED')], NOW, MAX);
    }
    expect(notification.overallStatus).toBe('FAILED');

    notification.recordAttempts([result('PUSH', 'UNAVAILABLE')], NOW, MAX);

    expect(notification.retryChannels(MAX)).toEqual(['PUSH']);
    expect(notification.overallStatus).toBe('PENDING_RETRY');
  });

  it('UC-1 E2: only real failures use up the budget, however many outages came first', () => {
    const notification = aNotification();
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      notification.recordAttempts([result('SMS', 'UNAVAILABLE')], NOW, MAX);
    }

    notification.recordAttempts([result('SMS', 'FAILED')], NOW, MAX);

    expect(notification.retryChannels(MAX)).toEqual(['SMS']);
    expect(notification.overallStatus).toBe('PENDING_RETRY');
  });

  it('UC-1 step 12: an attempt the gateway gave no error code for has no error code at all', () => {
    const notification = aNotification();

    notification.recordAttempts([result('PUSH', 'DELIVERED')], NOW, MAX);

    const [attempt] = notification.snapshot().attempts;
    expect(attempt).toBeDefined();
    expect('errorCode' in (attempt as object)).toBe(false);
  });

  it('counts how many times each channel has been tried', () => {
    const notification = aNotification();
    notification.recordAttempts([result('PUSH', 'FAILED'), result('SMS', 'DELIVERED')], NOW, MAX);
    notification.recordAttempts([result('PUSH', 'FAILED')], NOW, MAX);

    expect(notification.attemptsOn('PUSH')).toBe(2);
    expect(notification.attemptsOn('SMS')).toBe(1);
    expect(notification.attemptsOn('EMAIL')).toBe(0);
  });

  it('reports each channel by its latest word, in the order the channels first appeared', () => {
    const notification = aNotification();
    notification.recordAttempts([result('PUSH', 'FAILED'), result('SMS', 'FAILED')], NOW, MAX);
    notification.recordAttempts([result('PUSH', 'DELIVERED')], later(MINUTE), MAX);

    expect(notification.latestAttempts().map((a) => [a.channel, a.status])).toEqual([
      ['PUSH', 'DELIVERED'],
      ['SMS', 'FAILED'],
    ]);
  });
});

describe('UC-1 E3: AlertNotification.unsettledChannels (what Retry failed re-sends)', () => {
  it('lists every channel whose latest word is not delivered, even after the budget ran out', () => {
    const notification = aNotification();
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      notification.recordAttempts([result('PUSH', 'FAILED')], NOW, MAX);
    }
    notification.recordAttempts(
      [result('SMS', 'UNAVAILABLE'), result('WHATSAPP', 'DELIVERED')],
      NOW,
      MAX,
    );

    expect(notification.unsettledChannels()).toEqual(['PUSH', 'SMS']);
    expect(notification.needsRetry(MAX)).toBe(true);
  });
});

describe('UC-1 E2: AlertNotification.scheduleRetryAt', () => {
  it('remembers when the next automatic retry is due, and forgets it', () => {
    const notification = aNotification();

    notification.scheduleRetryAt(later(MINUTE));
    expect(notification.nextRetryAt).toEqual(later(MINUTE));

    notification.scheduleRetryAt(undefined);
    expect(notification.nextRetryAt).toBeUndefined();
    expect('nextRetryAt' in notification.snapshot()).toBe(false);
  });
});

describe('UC-1 E2: AlertNotification.unreachable', () => {
  it('counts as failed with no attempts, so it appears in the follow-up list', () => {
    const notification = AlertNotification.unreachable(
      { notificationId: 'N-2', warningId: 'W-1', citizenId: 'c-2', language: 'SI', content: 'x' },
      NOW,
    );

    expect(notification.isUnreachable).toBe(true);
    expect(notification.overallStatus).toBe('FAILED');
    expect(notification.isReached()).toBe(false);
    expect(notification.needsRetry(MAX)).toBe(false);
    expect(notification.unsettledChannels()).toEqual([]);
  });
});

describe('AlertNotification: persistence', () => {
  it('round-trips through a snapshot without sharing attempts with the original', () => {
    const original = aNotification();
    original.recordAttempts([result('PUSH', 'FAILED')], NOW, MAX);
    original.scheduleRetryAt(later(MINUTE));

    const copy = AlertNotification.restore(original.snapshot());
    copy.recordAttempts([result('PUSH', 'DELIVERED')], later(2 * MINUTE), MAX);

    expect(original.attemptsOn('PUSH')).toBe(1);
    expect(copy.attemptsOn('PUSH')).toBe(2);
    expect(copy.nextRetryAt).toEqual(later(MINUTE));
  });

  it('keeps its snapshot independent of the notification', () => {
    const notification = aNotification();
    notification.recordAttempts([result('PUSH', 'FAILED')], NOW, MAX);

    notification.snapshot().attempts.pop();

    expect(notification.attemptsOn('PUSH')).toBe(1);
  });

  it('keeps restored attempts independent of the object they came from', () => {
    const props = aNotification().snapshot();
    props.attempts.push({ channel: 'SMS', status: 'FAILED', attemptedAt: NOW });
    const restored = AlertNotification.restore(props);

    props.attempts[0]!.status = 'DELIVERED';

    expect(restored.latestAttempts()[0]?.status).toBe('FAILED');
  });
});
