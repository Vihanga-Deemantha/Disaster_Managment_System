import { RetryScheduler } from '../../infrastructure/RetryScheduler';

describe('UC-1 E3: RetryScheduler (the automatic retry)', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  const build = (
    retryDue: () => Promise<number> = async () => 0,
    intervalMs?: number,
  ): { scheduler: RetryScheduler; onError: jest.Mock } => {
    const onError = jest.fn();
    return { scheduler: new RetryScheduler({ retryDue, onError, intervalMs }), onError };
  };

  it('UC-1 E3: asks for the due retries every 15 seconds by default', async () => {
    const retryDue = jest.fn(async () => 0);
    const { scheduler } = build(retryDue);
    scheduler.start();

    await jest.advanceTimersByTimeAsync(14_999);
    expect(retryDue).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);
    expect(retryDue).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(15_000);
    expect(retryDue).toHaveBeenCalledTimes(2);

    scheduler.stop();
  });

  it('UC-1 E3: uses the interval it is given', async () => {
    const retryDue = jest.fn(async () => 0);
    const { scheduler } = build(retryDue, 1000);
    scheduler.start();

    await jest.advanceTimersByTimeAsync(3000);

    expect(retryDue).toHaveBeenCalledTimes(3);
    scheduler.stop();
  });

  it('UC-1 E3: starting twice does not run it twice as often', async () => {
    const retryDue = jest.fn(async () => 0);
    const { scheduler } = build(retryDue, 1000);
    scheduler.start();
    scheduler.start();

    await jest.advanceTimersByTimeAsync(1000);

    expect(retryDue).toHaveBeenCalledTimes(1);
    scheduler.stop();
  });

  it('UC-1 E3: stops when told to, and can start again afterwards', async () => {
    const retryDue = jest.fn(async () => 0);
    const { scheduler } = build(retryDue, 1000);
    scheduler.start();
    await jest.advanceTimersByTimeAsync(1000);

    scheduler.stop();
    await jest.advanceTimersByTimeAsync(5000);
    expect(retryDue).toHaveBeenCalledTimes(1);

    scheduler.start();
    await jest.advanceTimersByTimeAsync(1000);
    expect(retryDue).toHaveBeenCalledTimes(2);
    scheduler.stop();
  });

  it('UC-1 E3: stopping a scheduler that never started is harmless', () => {
    expect(() => build().scheduler.stop()).not.toThrow();
  });

  it('UC-1 E3: reports a failed round and carries on with the next one', async () => {
    const retryDue = jest
      .fn()
      .mockRejectedValueOnce(new Error('database is down'))
      .mockResolvedValue(2);
    const { scheduler, onError } = build(retryDue, 1000);
    scheduler.start();

    await jest.advanceTimersByTimeAsync(2000);

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'database is down' }));
    expect(retryDue).toHaveBeenCalledTimes(2);
    scheduler.stop();
  });

  it('UC-1 E3: skips a round while the previous one is still running, so nobody is tried twice at once', async () => {
    let finish!: () => void;
    const retryDue = jest.fn(() => new Promise<number>((resolve) => (finish = () => resolve(0))));
    const { scheduler } = build(retryDue, 1000);
    scheduler.start();

    await jest.advanceTimersByTimeAsync(3000);
    expect(retryDue).toHaveBeenCalledTimes(1);

    finish();
    await jest.advanceTimersByTimeAsync(1000);
    expect(retryDue).toHaveBeenCalledTimes(2);
    scheduler.stop();
  });

  it('UC-1 E3: tick runs one round directly', async () => {
    const retryDue = jest.fn(async () => 1);
    const { scheduler } = build(retryDue);

    await scheduler.tick();

    expect(retryDue).toHaveBeenCalledTimes(1);
  });
});
