export interface RetrySchedulerOptions {
  /** What to run each round: the controller's `retryDue`. */
  retryDue: () => Promise<number>;
  onError: (error: unknown) => void;
  intervalMs?: number;
}

const DEFAULT_INTERVAL_MS = 15_000;

/**
 * E3, automatically: every few seconds it asks the controller to retry whatever is due. It never
 * keeps the process alive, and a round that is still running when the next tick arrives is skipped,
 * so one slow gateway cannot cause the same citizens to be tried twice at once.
 */
export class RetryScheduler {
  private timer: NodeJS.Timeout | undefined;
  private running = false;

  constructor(private readonly options: RetrySchedulerOptions) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(
      () => void this.tick(),
      this.options.intervalMs ?? DEFAULT_INTERVAL_MS,
    );
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.options.retryDue();
    } catch (error) {
      this.options.onError(error);
    } finally {
      this.running = false;
    }
  }
}
