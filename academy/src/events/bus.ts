// EventEmitter-based event bus — Week 1 plumbing
// Swap to Redis pub/sub later without changing consumers

import { EventEmitter } from 'events';
import { IEventBus, DomainEvent, EventHandler } from '../interfaces/events';
import { randomUUID } from 'crypto';

export class InProcessEventBus implements IEventBus {
  private emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(50);
  }

  async publish(event: DomainEvent): Promise<void> {
    if (!event.id) event.id = randomUUID();
    if (!event.timestamp) event.timestamp = new Date();
    this.emitter.emit(event.type, event);
    this.emitter.emit('*', event);
  }

  subscribe(eventType: string, handler: EventHandler): void {
    this.emitter.on(eventType, handler);
  }

  subscribeAll(handler: EventHandler): void {
    this.emitter.on('*', handler);
  }
}

// Singleton — one bus for the whole process
export const eventBus = new InProcessEventBus();

// Helper to create events with less boilerplate
export function createEvent(
  type: string,
  aggregateId: string,
  payload: Record<string, any>,
  source: string
): DomainEvent {
  return {
    id: randomUUID(),
    type,
    timestamp: new Date(),
    aggregateId,
    payload,
    source,
  };
}
