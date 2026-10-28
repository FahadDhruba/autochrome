import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '../providers/types';
import { pruneScreenshots, REMOVED_SCREENSHOT } from './prune';

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
