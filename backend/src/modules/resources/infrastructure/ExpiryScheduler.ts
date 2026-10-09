export class ExpiryScheduler {
  private timer: NodeJS.Timeout | undefined;
  private running = false;
  constructor(
    private readonly options: { expire: () => Promise<void>; onError: (error: unknown) => void },
  ) {}
  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), 30_000);
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
      await this.options.expire();
    } catch (error) {
      this.options.onError(error);
    } finally {
      this.running = false;
    }
  }
}
