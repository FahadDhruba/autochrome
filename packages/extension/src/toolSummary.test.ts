import { describe, expect, it } from 'vitest';
import { summarizeInput } from './toolSummary';

describe('summarizeInput', () => {
  it('joins key/value pairs', () => {
    expect(summarizeInput({ ref: 'e3', clickCount: 2, force: true })).toBe(
      'ref: e3, clickCount: 2, force: true',
    );
  });

  it('is empty for no input and truncates long input', () => {
    expect(summarizeInput({})).toBe('');
    expect(summarizeInput(undefined)).toBe('');
    const long = summarizeInput({ text: 'x'.repeat(200) });
    expect(long).toHaveLength(80);
    expect(long.endsWith('…')).toBe(true);
  });
});
