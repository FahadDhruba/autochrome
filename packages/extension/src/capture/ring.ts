/** Keeps the newest `capacity` items; pushing past that drops the oldest. */
export class RingBuffer<T> {
  private items: T[] = [];

  constructor(readonly capacity: number) {}

  /** Returns the item that was dropped to make room, if any. */
  push(item: T): T | undefined {
    this.items.push(item);
    return this.items.length > this.capacity ? this.items.shift() : undefined;
  }

  toArray(): T[] {
    return [...this.items];
  }

  get size(): number {
    return this.items.length;
  }

  clear(): void {
    this.items = [];
  }
}

export const CAPTURE_CAPACITY = 500;
