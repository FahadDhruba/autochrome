import { describe, expect, it } from 'vitest';
import { formatNode, formatNodes } from './format';

describe('formatNode', () => {
  it('formats buttons, textboxes, checkboxes and headings', () => {
    expect(formatNode({ depth: 0, role: 'button', name: 'Submit', ref: 'e12' })).toBe(
      '[e12] button "Submit"',
    );
    expect(
      formatNode({ depth: 0, role: 'textbox', name: 'Email', ref: 'e3', value: 'a@b.c' }),
    ).toBe('[e3] textbox "Email" value="a@b.c"');
    expect(
      formatNode({ depth: 0, role: 'checkbox', name: 'Remember', ref: 'e4', checked: true }),
    ).toBe('[e4] checkbox "Remember" checked');
    expect(formatNode({ depth: 0, role: 'heading', name: 'Pricing', level: 2 })).toBe(
      'heading "Pricing" level=2',
    );
  });

  it('indents by depth, omits empty names and escapes quotes', () => {
    expect(formatNode({ depth: 2, role: 'list', name: '' })).toBe('    list');
    expect(formatNode({ depth: 0, role: 'link', name: 'Say "hi"', ref: 'e1' })).toBe(
      '[e1] link "Say \\"hi\\""',
    );
  });

  it('leaves unchecked state implicit', () => {
    expect(formatNode({ depth: 0, role: 'checkbox', name: 'X', checked: false })).toBe(
      'checkbox "X"',
    );
  });
});

describe('formatNodes', () => {
  it('joins lines and truncates long output', () => {
    const nodes = [
      { depth: 0, role: 'navigation', name: '' },
      { depth: 1, role: 'link', name: 'Home', ref: 'e1' },
    ];
    expect(formatNodes(nodes)).toBe('navigation\n  [e1] link "Home"');
    expect(formatNodes(nodes, 10)).toBe('navigation\n… truncated');
  });
});
