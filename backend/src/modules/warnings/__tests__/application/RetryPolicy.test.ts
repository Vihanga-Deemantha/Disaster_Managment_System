import { DEFAULT_RETRY_POLICY, RetryPolicy } from '../../application/RetryPolicy';
import { MINUTE, NOW } from '../../testing/builders';

describe('UC-1 A1 / E2: RetryPolicy', () => {
  it('UC-1 A1: by default a failed channel is retried three times', () => {
    expect(new RetryPolicy().maxRetries).toBe(3);
    expect(DEFAULT_RETRY_POLICY.maxRetries).toBe(3);
  });

  it('UC-1 E2: the wait before each retry doubles: 30 s, 1 min, 2 min, 4 min', () => {
    const policy = new RetryPolicy();

    expect([1, 2, 3, 4].map((retry) => policy.delayMs(retry))).toEqual([
      30_000, 60_000, 120_000, 240_000,
    ]);
  });

  it('UC-1 E2: the wait stops growing at the ceiling, so a long outage is not retried ever more rarely', () => {
    const policy = new RetryPolicy();

    expect(policy.delayMs(5)).toBe(480_000);
    expect(policy.delayMs(6)).toBe(10 * MINUTE);
    expect(policy.delayMs(40)).toBe(10 * MINUTE);
  });

  it('UC-1 E2: works out the due time from the "now" it is given, never from a clock of its own', () => {
    const policy = new RetryPolicy();

    expect(policy.nextRetryAt(NOW, 2)).toEqual(new Date(NOW.getTime() + 60_000));
  });

  it('takes its numbers from the options it is built with', () => {
    const policy = new RetryPolicy({ maxRetries: 5, baseDelayMs: 1000, maxDelayMs: 3000 });

    expect(policy.maxRetries).toBe(5);
    expect([1, 2, 3, 4].map((retry) => policy.delayMs(retry))).toEqual([1000, 2000, 3000, 3000]);
  });
});
