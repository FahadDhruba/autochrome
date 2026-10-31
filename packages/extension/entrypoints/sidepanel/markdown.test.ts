import { describe, expect, it } from 'vitest';
import { parseInline, parseMarkdown, safeHref } from './markdown';

describe('parseInline', () => {
  it('parses bold, italic and code', () => {
    expect(parseInline('a **b** *c* _d_ `e`')).toEqual([
      { type: 'text', text: 'a ' },
      { type: 'strong', children: [{ type: 'text', text: 'b' }] },
      { type: 'text', text: ' ' },
      { type: 'em', children: [{ type: 'text', text: 'c' }] },
      { type: 'text', text: ' ' },
      { type: 'em', children: [{ type: 'text', text: 'd' }] },
      { type: 'text', text: ' ' },
      { type: 'code', text: 'e' },
    ]);
  });

  it('keeps unclosed markers literal', () => {
    for (const src of ['**bold', 'a * b', '`code', '_x', '[a](http://x', 'snake_case_name']) {
      expect(parseInline(src)).toEqual([{ type: 'text', text: src }]);
    }
  });

  it('allows http, https and mailto links only', () => {
    expect(parseInline('[hi](https://x.com/a)')).toEqual([
      { type: 'link', href: 'https://x.com/a', children: [{ type: 'text', text: 'hi' }] },
    ]);
    expect(safeHref('mailto:a@b.c')).toBe('mailto:a@b.c');
    expect(parseInline('[x](javascript:alert(1))')).toEqual([
      { type: 'text', text: '[x](javascript:alert(1))' },
    ]);
    expect(safeHref('data:text/html,hi')).toBeUndefined();
  });

  it('leaves HTML as plain text', () => {
    expect(parseInline('<img src=x onerror=alert(1)>')).toEqual([
      { type: 'text', text: '<img src=x onerror=alert(1)>' },
    ]);
  });
});

describe('parseMarkdown', () => {
  it('splits paragraphs and turns single newlines into br', () => {
    expect(parseMarkdown('a\nb\n\nc')).toEqual([
      {
        type: 'paragraph',
        children: [{ type: 'text', text: 'a' }, { type: 'br' }, { type: 'text', text: 'b' }],
      },
      { type: 'paragraph', children: [{ type: 'text', text: 'c' }] },
    ]);
  });

  it('parses fenced code, including an unclosed fence', () => {
    expect(parseMarkdown('```js\nconst **a** = 1;\n```\nafter')).toEqual([
      { type: 'code', text: 'const **a** = 1;' },
      { type: 'paragraph', children: [{ type: 'text', text: 'after' }] },
    ]);
    expect(parseMarkdown('```\nopen')).toEqual([{ type: 'code', text: 'open' }]);
  });

  it('parses headings and quotes', () => {
    expect(parseMarkdown('## Title\n> quoted')).toEqual([
      { type: 'heading', level: 2, children: [{ type: 'text', text: 'Title' }] },
      {
        type: 'quote',
        children: [{ type: 'paragraph', children: [{ type: 'text', text: 'quoted' }] }],
      },
    ]);
  });

  it('parses unordered, ordered and nested lists', () => {
    const list = parseMarkdown('- a\n  1. x\n  2. y\n- b')[0];
    expect(list).toMatchObject({ type: 'list', ordered: false });
    if (list?.type !== 'list') throw new Error('expected list');
    expect(list.items).toHaveLength(2);
    expect(list.items[0]?.[1]).toMatchObject({ type: 'list', ordered: true });
    expect(parseMarkdown('1. one\n2. two')[0]).toMatchObject({ type: 'list', ordered: true });
  });

  it('does not throw on partial input', () => {
    for (const src of ['', '#', '> ', '- ', '1.', '[', '[a]', '```', '**', '`', '* *']) {
      expect(() => parseMarkdown(src)).not.toThrow();
    }
  });
});
