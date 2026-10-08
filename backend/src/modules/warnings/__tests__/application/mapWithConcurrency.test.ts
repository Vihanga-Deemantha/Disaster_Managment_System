import { mapWithConcurrency } from '../../application/mapWithConcurrency';

const tick = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

function tracker() {
  let inFlight = 0;
  let max = 0;
  return {
    get max() {
      return max;
    },
    async run<T>(value: T): Promise<T> {
      inFlight += 1;
      max = Math.max(max, inFlight);
      await tick();
      inFlight -= 1;
      return value;
    },
  };
}

describe('UC-1 step 10 (scalability): mapWithConcurrency', () => {
  it('returns every result, in the order of the items', async () => {
    const results = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (n) => n * 10);

    expect(results).toEqual([10, 20, 30, 40, 50]);
  });

  it('never has more than the limit running at once, and does use the whole limit', async () => {
    const watch = tracker();

    await mapWithConcurrency(
      Array.from({ length: 25 }, (_, i) => i),
      4,
      (n) => watch.run(n),
    );

    expect(watch.max).toBe(4);
  });

  it('runs one at a time when the limit is one', async () => {
    const watch = tracker();

    await mapWithConcurrency([1, 2, 3], 1, (n) => watch.run(n));

    expect(watch.max).toBe(1);
  });

  it('does not start more workers than there are items', async () => {
    const watch = tracker();

    await mapWithConcurrency([1, 2], 50, (n) => watch.run(n));

    expect(watch.max).toBe(2);
  });

  it('has nothing to do for an empty list', async () => {
    await expect(mapWithConcurrency([], 5, async () => 1)).resolves.toEqual([]);
  });

  it('passes a failure on to the caller', async () => {
    await expect(
      mapWithConcurrency([1, 2, 3], 2, async (n) => {
        if (n === 2) throw new Error('boom');
        return n;
      }),
    ).rejects.toThrow('boom');
  });
});
