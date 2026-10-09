export interface RetryPolicyOptions {
  /** How many times a failed channel is retried after its first try (A1: three). */
  maxRetries: number;
  /** The wait before the first retry; it doubles each time. */
  baseDelayMs: number;
  /** The wait never grows beyond this. */
  maxDelayMs: number;
}

export const DEFAULT_RETRY_POLICY: RetryPolicyOptions = {
  maxRetries: 3,
  baseDelayMs: 30_000,
  maxDelayMs: 10 * 60_000,
};

/**
 * When and how often to try again (A1, E2). Pure: it never reads the clock, the caller passes "now",
 * so every back-off in the tests is exact.
 */
export class RetryPolicy {
  constructor(private readonly options: RetryPolicyOptions = DEFAULT_RETRY_POLICY) {}

  get maxRetries(): number {
    return this.options.maxRetries;
  }

  /** The wait before retry number `retryNumber` (1 is the first retry): doubles each time, up to a ceiling. */
  delayMs(retryNumber: number): number {
    return Math.min(this.options.maxDelayMs, this.options.baseDelayMs * 2 ** (retryNumber - 1));
  }

  nextRetryAt(now: Date, retryNumber: number): Date {
    return new Date(now.getTime() + this.delayMs(retryNumber));
  }
}
