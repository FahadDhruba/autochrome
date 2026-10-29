import { describe, expect, it } from 'vitest';
import { formatTabState, MAX_TAB_STATE_LINES } from './tab-state';

const tab = (id: number) => ({ id, title: `Title ${id}`, url: `https://a.test/${id}` });

describe('formatTabState', () => {
  it('lists the current tab first and marks it', () => {
    const note = formatTabState([tab(1), tab(2)], 2)!;
    const lines = note.split('\n');
    expect(lines[0]).toContain('Current tab: 2');
    expect(lines.slice(1)).toEqual([
      '- 2 · Title 2 · https://a.test/2 [current]',
      '- 1 · Title 1 · https://a.test/1',
    ]);
  });

  it('is empty when there are no tabs', () => {
    expect(formatTabState([], undefined)).toBeUndefined();
  });

  it('never exceeds 15 lines and says how many tabs were left out', () => {
    const tabs = Array.from({ length: 40 }, (_, i) => tab(i + 1));
    const lines = formatTabState(tabs, 40)!.split('\n');
    expect(lines).toHaveLength(MAX_TAB_STATE_LINES);
    expect(lines[1]).toContain('[current]');
    expect(lines.at(-1)).toBe('- … and 27 more');
  });

  it('keeps all tabs when they fit exactly', () => {
    const lines = formatTabState(
      Array.from({ length: 14 }, (_, i) => tab(i)),
      0,
    )!.split('\n');
    expect(lines).toHaveLength(15);
    expect(lines.at(-1)).not.toContain('more');
  });

  it('flattens multi-line titles', () => {
    const note = formatTabState([{ id: 1, title: 'a\nb', url: 'u' }], 1)!;
    expect(note.split('\n')).toHaveLength(2);
  });
});
