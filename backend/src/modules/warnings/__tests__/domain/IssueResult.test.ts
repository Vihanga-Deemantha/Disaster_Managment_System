import { AlertNotification } from '../../domain/AlertNotification';
import { isTotalOutage, summarize } from '../../domain/IssueResult';
import { aNotification, NOW, result } from '../../testing/builders';

const MAX = 3;

function notification(id: string, results: ReturnType<typeof result>[]): AlertNotification {
  const made = aNotification({ id, citizenId: `citizen-${id}` });
  made.recordAttempts(results, NOW, MAX);
  return made;
}

describe('UC-1 step 14 / HCI-05a: summarize', () => {
  it('UC-1 step 14: with nobody targeted, every count is zero and every channel is listed', () => {
    expect(summarize([])).toEqual({
      targeted: 0,
      reached: 0,
      pendingRetry: 0,
      failed: 0,
      byChannel: {
        PUSH: { sent: 0, delivered: 0, failed: 0 },
        SMS: { sent: 0, delivered: 0, failed: 0 },
        WHATSAPP: { sent: 0, delivered: 0, failed: 0 },
        EMAIL: { sent: 0, delivered: 0, failed: 0 },
      },
    });
  });

  it('UC-1 step 14: tells delivered, pending and failed apart, and they add up to the targeted citizens', () => {
    const unreachable = AlertNotification.unreachable(
      { notificationId: 'N-5', warningId: 'W-1', citizenId: 'c-5', language: 'EN', content: 'x' },
      NOW,
    );
    const failedForGood = aNotification({ id: 'N-4', citizenId: 'c-4' });
    for (let i = 0; i < 4; i += 1)
      failedForGood.recordAttempts([result('SMS', 'FAILED')], NOW, MAX);

    const summary = summarize([
      notification('1', [result('PUSH', 'DELIVERED'), result('SMS', 'DELIVERED')]),
      notification('2', [result('PUSH', 'UNAVAILABLE'), result('SMS', 'UNAVAILABLE')]),
      notification('3', [result('PUSH', 'FAILED'), result('SMS', 'DELIVERED')]),
      failedForGood,
      unreachable,
    ]);

    expect(summary).toMatchObject({ targeted: 5, reached: 2, pendingRetry: 1, failed: 2 });
    expect(summary.reached + summary.pendingRetry + summary.failed).toBe(summary.targeted);
  });

  it('UC-1 A1: counts push failures on a citizen who was still reached by SMS', () => {
    const summary = summarize([
      notification('1', [result('PUSH', 'FAILED'), result('SMS', 'DELIVERED')]),
    ]);

    expect(summary.reached).toBe(1);
    expect(summary.byChannel.PUSH).toEqual({ sent: 1, delivered: 0, failed: 1 });
    expect(summary.byChannel.SMS).toEqual({ sent: 1, delivered: 1, failed: 0 });
  });

  it('UC-1 E2: a gateway that was unavailable is neither sent nor failed', () => {
    const summary = summarize([
      notification('1', [result('PUSH', 'UNAVAILABLE'), result('SMS', 'UNAVAILABLE')]),
    ]);

    expect(summary.byChannel.PUSH).toEqual({ sent: 0, delivered: 0, failed: 0 });
    expect(summary.byChannel.SMS).toEqual({ sent: 0, delivered: 0, failed: 0 });
    expect(summary.pendingRetry).toBe(1);
  });

  it('counts each channel by its latest attempt, so a retried push is one delivery', () => {
    const retried = aNotification();
    retried.recordAttempts([result('PUSH', 'FAILED'), result('SMS', 'DELIVERED')], NOW, MAX);
    retried.recordAttempts([result('PUSH', 'DELIVERED')], NOW, MAX);

    expect(summarize([retried]).byChannel.PUSH).toEqual({ sent: 1, delivered: 1, failed: 0 });
  });

  it('counts the optional channels too', () => {
    const summary = summarize([
      notification('1', [
        result('SMS', 'DELIVERED'),
        result('WHATSAPP', 'DELIVERED'),
        result('EMAIL', 'FAILED'),
      ]),
    ]);

    expect(summary.byChannel.WHATSAPP.delivered).toBe(1);
    expect(summary.byChannel.EMAIL).toEqual({ sent: 1, delivered: 0, failed: 1 });
  });
});

describe('UC-1 E2 / SC1-03: isTotalOutage', () => {
  it('UC-1 E2: is true when every attempt found its gateway unavailable', () => {
    const outage = [
      notification('1', [result('PUSH', 'UNAVAILABLE'), result('SMS', 'UNAVAILABLE')]),
      notification('2', [result('SMS', 'UNAVAILABLE')]),
    ];

    expect(isTotalOutage(outage)).toBe(true);
  });

  it('UC-1 E2: is false as soon as anything was actually sent, delivered or not', () => {
    expect(
      isTotalOutage([
        notification('1', [result('PUSH', 'UNAVAILABLE')]),
        notification('2', [result('SMS', 'FAILED')]),
      ]),
    ).toBe(false);
    expect(
      isTotalOutage([
        notification('1', [result('PUSH', 'UNAVAILABLE')]),
        notification('2', [result('SMS', 'DELIVERED')]),
      ]),
    ).toBe(false);
  });

  it('UC-1 E2: is false when nothing was attempted at all (an empty list is not an outage)', () => {
    expect(isTotalOutage([])).toBe(false);
    expect(isTotalOutage([aNotification()])).toBe(false);
  });
});
