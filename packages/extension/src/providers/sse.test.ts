import { describe, expect, it } from 'vitest';
import { readSse } from './sse';

function bodyOf(...chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

async function read(...chunks: string[]) {
  const messages = [];
  for await (const message of readSse(bodyOf(...chunks))) messages.push(message);
  return messages;
}

describe('readSse', () => {
  it('reads events with names and data', async () => {
    expect(await read('event: ping\ndata: {"a":1}\n\ndata: two\n\n')).toEqual([
      { event: 'ping', data: '{"a":1}' },
      { event: undefined, data: 'two' },
    ]);
  });

  it('joins multi-line data with newlines', async () => {
    expect(await read('data: one\ndata: two\n\n')).toEqual([
      { event: undefined, data: 'one\ntwo' },
    ]);
  });

  it('skips comments and handles CRLF', async () => {
    expect(await read(': keep-alive\r\ndata: x\r\n\r\n')).toEqual([
      { event: undefined, data: 'x' },
    ]);
  });

  it('reassembles events split across chunks, even inside a CRLF', async () => {
    expect(await read('da', 'ta: hel', 'lo\r', '\n\r', '\n')).toEqual([
      { event: undefined, data: 'hello' },
    ]);
  });

  it('flushes a final event that has no closing blank line', async () => {
    expect(await read('data: last')).toEqual([{ event: undefined, data: 'last' }]);
  });

  it('stops at [DONE]', async () => {
    expect(await read('data: a\n\ndata: [DONE]\n\ndata: ignored\n\n')).toEqual([
      { event: undefined, data: 'a' },
    ]);
  });
});
