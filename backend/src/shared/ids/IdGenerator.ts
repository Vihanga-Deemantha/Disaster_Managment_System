import { randomUUID } from 'node:crypto';

/** Identifiers are injected, never generated inline, so tests can predict them. */
export interface IdGenerator {
  next(): string;
}

export class UuidGenerator implements IdGenerator {
  next(): string {
    return randomUUID();
  }
}

/** Test generator: `id-1`, `id-2`, ... */
export class SequentialIdGenerator implements IdGenerator {
  private counter = 0;

  constructor(private readonly prefix = 'id') {}

  next(): string {
    this.counter += 1;
    return `${this.prefix}-${this.counter}`;
  }
}
