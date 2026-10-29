import { describe, expect, it } from 'vitest';
import { summarizeInput, summarizeResult, toolGroup } from './toolSummary';

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

describe('toolGroup', () => {
  it('groups tools by family', () => {
    expect(toolGroup('tab_open')).toBe('tabs');
    expect(toolGroup('get_text')).toBe('read');
    expect(toolGroup('click')).toBe('input');
    expect(toolGroup('js_eval')).toBe('debug');
    expect(toolGroup('workflow_run')).toBe('workflow');
  });
});

describe('summarizeResult', () => {
  const text = (value: string) => [{ type: 'text' as const, text: value }];

  it('counts elements, matches and characters', () => {
    const tree = '[e1] button "A"\n[e2] link "B"\n  heading "C" level=2';
    expect(summarizeResult('read_page', text(tree), false)).toBe('3 elements');
    expect(summarizeResult('read_page', text('[e1] button "A"'), false)).toBe('1 element');
    expect(summarizeResult('find', text('[e1] button "A"\n[e2] button "B"'), false)).toBe(
      '2 matches',
    );
    expect(summarizeResult('find', text('No elements match "x".'), false)).toBe('No matches');
    expect(summarizeResult('get_text', text('x'.repeat(1240)), false)).toBe(
      `${(1240).toLocaleString()} chars`,
    );
  });

  it('leaves screenshots to the thumbnail', () => {
    const image = [{ type: 'image' as const, mimeType: 'image/png', data: 'AA' }];
    expect(summarizeResult('screenshot', image, false)).toBe('');
  });

  it('ignores the tab context line and the page_content wrapper the model sees', () => {
    const wrapped = [
      '[tab 12 · Form · http://a.test/form.html]',
      '<page_content site="http://a.test">',
      '[e1] button "A"',
      '[e2] button "B"',
      '</page_content>',
    ].join('\n');
    expect(summarizeResult('read_page', text(wrapped), false)).toBe('2 elements');
    expect(
      summarizeResult(
        'get_text',
        text('[tab 1 · T · u]\n<page_content site="u">\nhello\n</page_content>'),
        false,
      ),
    ).toBe('5 chars');
  });

  it('counts console messages and network requests without the capture note', () => {
    const note = '(Captured since 10:00:00 UTC, when autochrome attached to this tab.)';
    const logs = `[tab 1 · T · u]\n<page_content site="u">\n[10:00] log a\n[10:01] error b\n${note}\n</page_content>`;
    expect(summarizeResult('console_logs', text(logs), false)).toBe('2 messages');
    expect(summarizeResult('console_logs', text(`No console messages.\n${note}`), false)).toBe(
      'No messages',
    );
    expect(
      summarizeResult(
        'network_requests',
        text(`[r1] GET 200 http://a.test (fetch)\n${note}`),
        false,
      ),
    ).toBe('1 request');
  });

  it('shows the first line of an error and the first line of other results', () => {
    expect(summarizeResult('click', text('\nNo element e9\nsecond line'), true)).toBe(
      'No element e9',
    );
    expect(summarizeResult('navigate', text('Navigated to https://a.test\nTitle'), false)).toBe(
      'Navigated to https://a.test',
    );
    expect(summarizeResult('wait', [], false)).toBe('Done');
  });
});
