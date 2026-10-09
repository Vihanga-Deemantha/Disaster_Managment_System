/**
 * Time is injected, never read directly: `new Date()` is forbidden in domain and application code
 * so every rule that depends on "now" (validity windows, 5-minute re-auth, back-off) is testable.
 */
export interface Clock {
  now(): Date;
}

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}

/** Test clock: stands still until told to move. */
export class FixedClock implements Clock {
  private current: Date;

  constructor(initial: Date | string = '2026-10-07T09:00:00.000Z') {
    this.current = new Date(initial);
  }

  now(): Date {
    return new Date(this.current);
  }

  set(value: Date | string): void {
    this.current = new Date(value);
  }

  advance(milliseconds: number): void {
    this.current = new Date(this.current.getTime() + milliseconds);
  }
}
