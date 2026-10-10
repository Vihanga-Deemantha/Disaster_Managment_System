import type { KeyValueStore } from '@/shared/storage/KeyValueStore';

/** A `KeyValueStore` that lives in memory, for tests. `breakWith` makes every call fail, like a full disk. */
export class InMemoryKeyValueStore implements KeyValueStore {
  readonly values = new Map<string, string>();
  private failure: Error | undefined;

  breakWith(error: Error | undefined = new Error('storage is full')): void {
    this.failure = error;
  }

  async get(key: string): Promise<string | null> {
    this.throwIfBroken();
    return this.values.get(key) ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    this.throwIfBroken();
    this.values.set(key, value);
  }

  async remove(key: string): Promise<void> {
    this.throwIfBroken();
    this.values.delete(key);
  }

  private throwIfBroken(): void {
    if (this.failure) throw this.failure;
  }
}
