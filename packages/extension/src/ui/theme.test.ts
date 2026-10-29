import { describe, expect, it } from 'vitest';
import { normalizeTheme } from './theme';

describe('normalizeTheme', () => {
  it('keeps the two explicit choices', () => {
    expect(normalizeTheme('light')).toBe('light');
    expect(normalizeTheme('dark')).toBe('dark');
  });

  it('treats anything else as the system setting', () => {
    for (const value of ['system', '', 'blue', undefined, null, 3]) {
      expect(normalizeTheme(value)).toBe('system');
    }
  });
});
