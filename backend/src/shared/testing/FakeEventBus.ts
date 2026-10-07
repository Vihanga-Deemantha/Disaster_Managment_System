import type { DomainEvent, DomainEventType, EventOfType } from '../contracts/events';
import { InMemoryEventBus } from '../events/EventBus';

/** Test bus: records every published event so "published with the right payload" is one assertion. */
export class FakeEventBus extends InMemoryEventBus {
  readonly published: DomainEvent[] = [];
  readonly handlerErrors: unknown[] = [];

  constructor() {
    super((error) => {
      this.handlerErrors.push(error);
    });
  }

  override async publish(event: DomainEvent): Promise<void> {
    this.published.push(event);
    await super.publish(event);
  }

  ofType<T extends DomainEventType>(type: T): EventOfType<T>[] {
    return this.published.filter((event): event is EventOfType<T> => event.type === type);
  }
}
