import { describe, expect, it } from 'vitest';
import { estimateCost, formatCost, parseLimits } from './limits';

describe('limits and cost', () => {
  it('reads limits with defaults and bounds', () => {
    expect(parseLimits(undefined)).toEqual({ maxSteps: 50, maxTokens: 0 });
    expect(parseLimits({ maxSteps: 999, maxTokens: -5 })).toEqual({ maxSteps: 200, maxTokens: 0 });
    expect(parseLimits({ maxSteps: '12', maxTokens: 50000 })).toEqual({
      maxSteps: 12,
      maxTokens: 50000,
    });
  });

  it('estimates cost from per-million prices', () => {
    const usage = { inputTokens: 200_000, outputTokens: 10_000, cacheReadTokens: 0 };
    expect(estimateCost(usage, { input: 0.1, output: 0.4 })).toBeCloseTo(0.024);
    expect(formatCost(0.024)).toBe('$0.024');
    expect(formatCost(0.004)).toBe('<$0.01');
    expect(formatCost(3.456)).toBe('$3.46');
  });
});
