import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '../providers/types';
import { pruneScreenshots, pruneStaleResults, REMOVED_SCREENSHOT } from './prune';

const shot = (id: string): ChatMessage => ({
  role: 'user',
  parts: [
    {
      type: 'tool_result',
      callId: id,
      isError: false,
      content: [
        { type: 'text', text: `shot ${id}` },
        { type: 'image', data: id, mimeType: 'image/jpeg' },
      ],
    },
  ],
});

const imagesIn = (messages: ChatMessage[]) =>
  messages
    .flatMap((m) => m.parts)
    .flatMap((p) => (p.type === 'tool_result' ? p.content : []))
    .filter((c) => c.type === 'image');

describe('pruneScreenshots', () => {
  const history = ['a', 'b', 'c', 'd', 'e'].map(shot);

  it('keeps the three newest screenshots and replaces older ones with text', () => {
    const pruned = pruneScreenshots(history);
    expect(imagesIn(pruned).map((image) => (image as { data: string }).data)).toEqual([
      'c',
      'd',
      'e',
    ]);
    expect(pruned[0]?.parts[0]).toMatchObject({
      content: [
        { type: 'text', text: 'shot a' },
        { type: 'text', text: REMOVED_SCREENSHOT },
      ],
    });
  });

  it('does not change the stored history', () => {
    pruneScreenshots(history);
    expect(imagesIn(history)).toHaveLength(5);
  });

  it('returns everything when there are few screenshots', () => {
    expect(imagesIn(pruneScreenshots(history.slice(0, 2)))).toHaveLength(2);
  });
});

const call = (id: string, name: string, input: unknown = {}): ChatMessage => ({
  role: 'assistant',
  parts: [{ type: 'tool_call', id, name, input }],
});
const result = (id: string, text: string, isError = false): ChatMessage => ({
  role: 'user',
  parts: [{ type: 'tool_result', callId: id, isError, content: [{ type: 'text', text }] }],
});
const prompt = (text: string): ChatMessage => ({ role: 'user', parts: [{ type: 'text', text }] });
const textOf = (message: ChatMessage | undefined) => {
  const part = message?.parts[0];
  const item = part?.type === 'tool_result' ? part.content[0] : undefined;
  return item?.type === 'text' ? item.text : '';
};
const LONG = Array.from({ length: 50 }, (_, i) => `link "L${i}"`).join('\n');

describe('pruneStaleResults', () => {
  it('keeps only the newest read per tool and tab in the current task', () => {
    const history = [
      prompt('go'),
      call('1', 'read_page'),
      result('1', LONG),
      call('2', 'read_page'),
      result('2', LONG),
    ];
    const pruned = pruneStaleResults(history);
    expect(textOf(pruned[2])).toBe(
      '[earlier read_page output removed (50 elements); call read_page again if needed]',
    );
    expect(textOf(pruned[4])).toBe(LONG);
  });

  it('keeps reads of different tabs, and tracks tools separately', () => {
    const history = [
      prompt('go'),
      call('1', 'read_page', { tabId: 1 }),
      result('1', LONG),
      call('2', 'read_page', { tabId: 2 }),
      result('2', LONG),
      call('3', 'get_text', { tabId: 1 }),
      result('3', LONG),
    ];
    const pruned = pruneStaleResults(history);
    expect([2, 4, 6].map((i) => textOf(pruned[i]))).toEqual([LONG, LONG, LONG]);
  });

  it('stubs long results from earlier tasks, keeping short ones and errors', () => {
    const history = [
      prompt('first'),
      call('1', 'read_page'),
      result('1', LONG),
      call('2', 'click'),
      result('2', 'Clicked'),
      call('3', 'get_text'),
      result('3', LONG, true),
      prompt('second'),
    ];
    const pruned = pruneStaleResults(history);
    expect(textOf(pruned[2])).toBe('[output from an earlier task removed (50 elements)]');
    expect(textOf(pruned[4])).toBe('Clicked');
    expect(textOf(pruned[6])).toBe(LONG);
  });

  it('does not mutate the stored history', () => {
    const history = [
      prompt('go'),
      call('1', 'read_page'),
      result('1', LONG),
      call('2', 'read_page'),
      result('2', LONG),
    ];
    const copy = structuredClone(history);
    pruneStaleResults(history);
    expect(history).toEqual(copy);
  });

  it('keeps every find result', () => {
    const pruned = pruneStaleResults([
      prompt('go'),
      call('1', 'find'),
      result('1', LONG),
      call('2', 'find'),
      result('2', LONG),
    ]);
    expect(textOf(pruned[2])).toBe(LONG);
    expect(textOf(pruned[4])).toBe(LONG);
  });

  it('never un-stubs a result as the history grows', () => {
    const history = [
      prompt('a'),
      call('1', 'read_page'),
      result('1', LONG),
      call('2', 'read_page'),
      result('2', LONG),
    ];
    const before = pruneStaleResults(history);
    const grown = [...history, call('3', 'read_page'), result('3', LONG), prompt('b')];
    const after = pruneStaleResults(grown);
    for (const [i, message] of before.entries()) {
      if (textOf(message).startsWith('[')) expect(textOf(after[i]).startsWith('[')).toBe(true);
    }
    expect(textOf(after[4]).startsWith('[')).toBe(true);
  });
});
