export type KeyEvent = {
  type: 'keyDown' | 'rawKeyDown' | 'keyUp';
  key: string;
  code: string;
  windowsVirtualKeyCode: number;
  modifiers: number;
  text?: string;
};

type KeyInfo = { key: string; code: string; keyCode: number; text?: string };

/** Bitmask values of `Input.dispatchKeyEvent` modifiers. */
const MODIFIERS: Record<string, { bit: number; info: KeyInfo }> = {
  alt: { bit: 1, info: { key: 'Alt', code: 'AltLeft', keyCode: 18 } },
  control: { bit: 2, info: { key: 'Control', code: 'ControlLeft', keyCode: 17 } },
  meta: { bit: 4, info: { key: 'Meta', code: 'MetaLeft', keyCode: 91 } },
  shift: { bit: 8, info: { key: 'Shift', code: 'ShiftLeft', keyCode: 16 } },
};

const MODIFIER_ALIASES: Record<string, string> = {
  ctrl: 'control',
  option: 'alt',
  cmd: 'meta',
  command: 'meta',
};

const NAMED_KEYS: Record<string, KeyInfo> = {
  enter: { key: 'Enter', code: 'Enter', keyCode: 13, text: '\r' },
  tab: { key: 'Tab', code: 'Tab', keyCode: 9 },
  escape: { key: 'Escape', code: 'Escape', keyCode: 27 },
  backspace: { key: 'Backspace', code: 'Backspace', keyCode: 8 },
  delete: { key: 'Delete', code: 'Delete', keyCode: 46 },
  space: { key: ' ', code: 'Space', keyCode: 32, text: ' ' },
  arrowleft: { key: 'ArrowLeft', code: 'ArrowLeft', keyCode: 37 },
  arrowup: { key: 'ArrowUp', code: 'ArrowUp', keyCode: 38 },
  arrowright: { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39 },
  arrowdown: { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40 },
  home: { key: 'Home', code: 'Home', keyCode: 36 },
  end: { key: 'End', code: 'End', keyCode: 35 },
  pageup: { key: 'PageUp', code: 'PageUp', keyCode: 33 },
  pagedown: { key: 'PageDown', code: 'PageDown', keyCode: 34 },
  insert: { key: 'Insert', code: 'Insert', keyCode: 45 },
};

const KEY_ALIASES: Record<string, string> = {
  return: 'enter',
  esc: 'escape',
  del: 'delete',
  ' ': 'space',
  left: 'arrowleft',
  up: 'arrowup',
  right: 'arrowright',
  down: 'arrowdown',
};

function lookupKey(name: string, shift: boolean): KeyInfo {
  const lower = name.toLowerCase();
  const named = NAMED_KEYS[KEY_ALIASES[lower] ?? lower];
  if (named) return named;

  const fn = /^f([1-9]|1[0-2])$/.exec(lower);
  if (fn) return { key: `F${fn[1]}`, code: `F${fn[1]}`, keyCode: 111 + Number(fn[1]) };

  if (/^[a-z]$/i.test(name)) {
    const key = shift ? name.toUpperCase() : name.toLowerCase();
    return {
      key,
      code: `Key${name.toUpperCase()}`,
      keyCode: name.toUpperCase().charCodeAt(0),
      text: key,
    };
  }
  if (/^[0-9]$/.test(name)) {
    return { key: name, code: `Digit${name}`, keyCode: name.charCodeAt(0), text: name };
  }
  // Other printable characters are typed as text; they have no stable code or key code.
  if ([...name].length === 1) return { key: name, code: '', keyCode: 0, text: name };
  throw new Error(`Unknown key "${name}".`);
}

/** Split "Control+Shift+a" into ["Control", "Shift", "a"]; a trailing "+" is the plus key. */
function splitCombo(combo: string): string[] {
  return combo.split(/\+(?=.)/);
}

/** CDP events for one key press, e.g. "Control+a": modifiers down, key down/up, modifiers up. */
export function keyEvents(combo: string): KeyEvent[] {
  const parts = splitCombo(combo);
  const keyName = parts.pop() ?? '';
  const held: { bit: number; info: KeyInfo }[] = parts.map((part) => {
    const lower = part.toLowerCase();
    const modifier = MODIFIERS[MODIFIER_ALIASES[lower] ?? lower];
    if (!modifier) throw new Error(`Unknown modifier "${part}" in "${combo}".`);
    return modifier;
  });

  const modifierMask = held.reduce((mask, m) => mask | m.bit, 0);
  const shift = (modifierMask & MODIFIERS.shift!.bit) !== 0;
  const main = lookupKey(keyName, shift);
  // Shortcuts like Control+a must not insert a character.
  const downType =
    !main.text || modifierMask & ~MODIFIERS.shift!.bit
      ? ('rawKeyDown' as const)
      : ('keyDown' as const);
  const text = downType === 'keyDown' ? main.text : undefined;

  const events: KeyEvent[] = [];
  let mask = 0;
  for (const m of held) {
    mask |= m.bit;
    events.push({
      type: 'rawKeyDown',
      key: m.info.key,
      code: m.info.code,
      windowsVirtualKeyCode: m.info.keyCode,
      modifiers: mask,
    });
  }
  const base = {
    key: main.key,
    code: main.code,
    windowsVirtualKeyCode: main.keyCode,
    modifiers: modifierMask,
  };
  events.push({ ...base, type: downType, ...(text === undefined ? {} : { text }) });
  events.push({ ...base, type: 'keyUp' });
  for (const m of [...held].reverse()) {
    mask &= ~m.bit;
    events.push({
      type: 'keyUp',
      key: m.info.key,
      code: m.info.code,
      windowsVirtualKeyCode: m.info.keyCode,
      modifiers: mask,
    });
  }
  return events;
}

/** Whitespace-separated key presses, e.g. "Tab Tab Enter". */
export function parseKeys(keys: string): KeyEvent[] {
  return keys.trim().split(/\s+/).flatMap(keyEvents);
}
