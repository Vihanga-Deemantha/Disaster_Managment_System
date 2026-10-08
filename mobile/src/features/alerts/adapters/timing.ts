import type { Clock, Scheduler } from '../domain/ports';

/** The phone's real clock. */
export const systemClock: Clock = { now: () => new Date() };

/** The real timer: runs the task every interval until the returned function is called. */
export const intervalScheduler: Scheduler = {
  every(intervalMs, task) {
    const handle = setInterval(task, intervalMs);
    return () => clearInterval(handle);
  },
};
