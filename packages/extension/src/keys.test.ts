import { describe, expect, it } from 'vitest';
import { keyEvents, parseKeys } from './keys';

describe('keyEvents', () => {
  it('presses Enter with text so forms submit', () => {
    expect(keyEvents('Enter')).toEqual([
      {
        type: 'keyDown',
        key: 'Enter',
        code: 'Enter',
        windowsVirtualKeyCode: 13,
        modifiers: 0,
        text: '\r',
      },
      { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, modifiers: 0 },
    ]);
  });

  it('types printable characters', () => {
    const [down] = keyEvents('a');
    expect(down).toMatchObject({
      type: 'keyDown',
      key: 'a',
      code: 'KeyA',
      windowsVirtualKeyCode: 65,
      text: 'a',
    });
  });

  it('uppercases with Shift and sets the modifier bit', () => {
    const events = keyEvents('Shift+a');
    expect(events.map((e) => e.type)).toEqual(['rawKeyDown', 'keyDown', 'keyUp', 'keyUp']);
    expect(events[1]).toMatchObject({ key: 'A', modifiers: 8, text: 'A' });
    expect(events[3]).toMatchObject({ key: 'Shift', modifiers: 0 });
  });

  it('does not insert text for shortcuts', () => {
    const events = keyEvents('Control+a');
    expect(events[0]).toMatchObject({ key: 'Control', modifiers: 2 });
    expect(events[1]).toMatchObject({ type: 'rawKeyDown', key: 'a', modifiers: 2 });
    expect(events[1]).not.toHaveProperty('text');
  });

  it('combines modifiers and accepts aliases', () => {
    const events = keyEvents('ctrl+shift+Esc');
    expect(events[2]).toMatchObject({ key: 'Escape', modifiers: 10, windowsVirtualKeyCode: 27 });
  });

  it('handles Shift+Tab, arrows, function keys and the plus key', () => {
    expect(keyEvents('Shift+Tab')[1]).toMatchObject({
      type: 'rawKeyDown',
      key: 'Tab',
      modifiers: 8,
    });
    expect(keyEvents('down')[0]).toMatchObject({ key: 'ArrowDown', windowsVirtualKeyCode: 40 });
    expect(keyEvents('F5')[0]).toMatchObject({ key: 'F5', windowsVirtualKeyCode: 116 });
    expect(keyEvents('Control++')[1]).toMatchObject({ key: '+', modifiers: 2 });
  });

  it('rejects unknown keys and modifiers', () => {
    expect(() => keyEvents('Banana')).toThrow('Unknown key "Banana"');
    expect(() => keyEvents('Hyper+a')).toThrow('Unknown modifier "Hyper"');
  });
});

describe('parseKeys', () => {
  it('splits several presses on whitespace', () => {
    const events = parseKeys('Tab  Tab Enter');
    expect(events.filter((e) => e.type === 'keyUp').map((e) => e.key)).toEqual([
      'Tab',
      'Tab',
      'Enter',
    ]);
  });
});
