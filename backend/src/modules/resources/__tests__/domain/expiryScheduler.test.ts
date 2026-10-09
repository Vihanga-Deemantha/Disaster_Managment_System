import { ExpiryScheduler } from '../../infrastructure/ExpiryScheduler';
afterEach(() => jest.useRealTimers());
it('UC-2 E1: expires automatically every thirty seconds and can stop safely', async () => {
  jest.useFakeTimers();
  const expire = jest.fn(async () => undefined);
  const scheduler = new ExpiryScheduler({ expire, onError: jest.fn() });
  scheduler.stop();
  scheduler.start();
  scheduler.start();
  await jest.advanceTimersByTimeAsync(30_000);
  expect(expire).toHaveBeenCalledTimes(1);
  scheduler.stop();
  await jest.advanceTimersByTimeAsync(30_000);
  expect(expire).toHaveBeenCalledTimes(1);
});
it('skips overlapping expiry rounds and retries after a failed round', async () => {
  let finish: () => void = () => undefined;
  const expire = jest.fn(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const onError = jest.fn();
  const scheduler = new ExpiryScheduler({ expire, onError });
  const first = scheduler.tick();
  await scheduler.tick();
  expect(expire).toHaveBeenCalledTimes(1);
  finish();
  await first;
  expire.mockRejectedValueOnce(new Error('Database unavailable'));
  await scheduler.tick();
  expect(onError).toHaveBeenCalledTimes(1);
  const retry = scheduler.tick();
  finish();
  await retry;
  expect(expire).toHaveBeenCalledTimes(3);
});
