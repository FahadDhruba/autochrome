import { describe, expect, it } from 'vitest';
import { RingBuffer } from './ring';

describe('RingBuffer', () => {
  it('keeps the newest items and returns the dropped one', () => {
    const ring = new RingBuffer<number>(3);
    expect([1, 2, 3].map((n) => ring.push(n))).toEqual([undefined, undefined, undefined]);
    expect(ring.push(4)).toBe(1);
    expect(ring.toArray()).toEqual([2, 3, 4]);
    expect(ring.size).toBe(3);
  });

  it('clears', () => {
    const ring = new RingBuffer<number>(2);
    ring.push(1);
    ring.clear();
    expect(ring.toArray()).toEqual([]);
  });
});
