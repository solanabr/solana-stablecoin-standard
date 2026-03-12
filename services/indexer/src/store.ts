interface IndexedEvent {
  type: string;
  data: string;
  ts: string;
}

export class EventStore {
  private events: IndexedEvent[] = [];

  add(event: IndexedEvent): void {
    this.events.push(event);
    // Keep last 10k events in memory
    if (this.events.length > 10000) {
      this.events.shift();
    }
  }

  getAll(): IndexedEvent[] {
    return [...this.events].reverse();
  }

  getByType(type: string): IndexedEvent[] {
    return this.events.filter((e) => e.type === type).reverse();
  }
}
