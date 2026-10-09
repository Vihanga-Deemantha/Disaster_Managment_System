import type { DomainEvent, DomainEventType, EventOfType } from '../contracts/events';

export type EventHandler<T extends DomainEventType> = (
  event: EventOfType<T>,
) => void | Promise<void>;
export type Unsubscribe = () => void;

/**
 * The only way modules talk to each other (master plan §8). Publishers do not know who listens.
 * A failing subscriber must never break the publisher: UC-4 being down cannot stop UC-1 issuing.
 */
export interface EventBus {
  publish(event: DomainEvent): Promise<void>;
  subscribe<T extends DomainEventType>(type: T, handler: EventHandler<T>): Unsubscribe;
}

type AnyHandler = (event: DomainEvent) => void | Promise<void>;

export class InMemoryEventBus implements EventBus {
  private readonly handlers = new Map<DomainEventType, Set<AnyHandler>>();

  constructor(
    private readonly onHandlerError: (error: unknown, event: DomainEvent) => void = () => undefined,
  ) {}

  async publish(event: DomainEvent): Promise<void> {
    const listeners = [...(this.handlers.get(event.type) ?? [])];
    const outcomes = await Promise.allSettled(listeners.map(async (listener) => listener(event)));
    for (const outcome of outcomes) {
      if (outcome.status === 'rejected') this.onHandlerError(outcome.reason, event);
    }
  }

  subscribe<T extends DomainEventType>(type: T, handler: EventHandler<T>): Unsubscribe {
    // The map is keyed by event type, so a handler only ever receives events of its own type.
    const listener = handler as unknown as AnyHandler;
    const set = this.handlers.get(type) ?? new Set<AnyHandler>();
    set.add(listener);
    this.handlers.set(type, set);
    return () => {
      set.delete(listener);
    };
  }
}
