// IEventBus — plumbing, not a domain
// Week 1: EventEmitter in-process
// Week 3+: swap to Redis pub/sub if needed

export interface DomainEvent {
  id: string;
  type: string;
  timestamp: Date;
  aggregateId: string;
  payload: Record<string, any>;
  source: string;
}

export type EventHandler = (event: DomainEvent) => void | Promise<void>;

export interface IEventBus {
  publish(event: DomainEvent): Promise<void>;
  subscribe(eventType: string, handler: EventHandler): void;
  subscribeAll(handler: EventHandler): void;
}
