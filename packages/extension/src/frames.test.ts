import { describe, expect, it } from 'vitest';
import { spliceFrames, splitRef } from './frames';

describe('splitRef', () => {
  it('reads the frame from a prefixed ref', () => {
    expect(splitRef('f12e5')).toEqual({ frameId: 12, ref: 'e5' });
    expect(splitRef('e5')).toEqual({ frameId: 0, ref: 'e5' });
  });
});

describe('spliceFrames', () => {
  it('puts each frame under its iframe line, indented, with prefixed refs', () => {
    const top = [
      '[e1] button "Top"',
      'main',
      '  iframe "Pay" frame=t7',
      'iframe "Ad" frame=t9',
    ].join('\n');
    const trees = new Map([
      [7, '[e1] textbox "Card"\niframe "Inner" frame=t8'],
      [8, '[e1] button "Deep"'],
    ]);
    const ids: Record<string, number> = { t7: 7, t8: 8, t9: 9 };
    expect(spliceFrames(top, trees, (token) => ids[token])).toBe(
      [
        '[e1] button "Top"',
        'main',
        '  iframe "Pay"',
        '    [f7e1] textbox "Card"',
        '    iframe "Inner"',
        '      [f8e1] button "Deep"',
        // A frame that could not be read keeps its line, without the token.
        'iframe "Ad"',
      ].join('\n'),
    );
  });
});
