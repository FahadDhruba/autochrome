export type SseMessage = { event?: string; data: string };

/**
 * Reads a Server-Sent Events body. Multi-line `data:` fields are joined with newlines, comment
 * lines are skipped, and the stream ends at an OpenAI-style `[DONE]` sentinel.
 */
export async function* readSse(body: ReadableStream<Uint8Array>): AsyncGenerator<SseMessage> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let event: string | undefined;
  let data: string[] = [];

  // Returns a message when a blank line closes one.
  const takeLine = (line: string): SseMessage | undefined => {
    if (line === '') {
      const message = data.length > 0 ? { event, data: data.join('\n') } : undefined;
      event = undefined;
      data = [];
      return message;
    }
    if (line.startsWith(':')) return undefined;
    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? '' : line.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'data') data.push(value);
    else if (field === 'event') event = value;
    return undefined;
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const lines = buffer.split(/\r?\n/);
      buffer = done ? '' : (lines.pop() ?? '');
      if (done) lines.push('');
      for (const line of lines) {
        const message = takeLine(line);
        if (!message) continue;
        if (message.data === '[DONE]') return;
        yield message;
      }
      if (done) return;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}
