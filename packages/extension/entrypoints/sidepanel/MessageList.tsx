import { useEffect, useRef, type ReactNode } from 'react';
import type { ChatMessage, Part, Usage } from '@/src/providers/types';
import ToolCard from './ToolCard';

type ToolResult = Extract<Part, { type: 'tool_result' }>;

function resultsById(messages: ChatMessage[]): Map<string, ToolResult> {
  const results = new Map<string, ToolResult>();
  for (const part of messages.flatMap((message) => message.parts)) {
    if (part.type === 'tool_result') results.set(part.callId, part);
  }
  return results;
}

function formatUsage(usage: Usage): string {
  const parts = [
    `${usage.inputTokens.toLocaleString()} in`,
    `${usage.outputTokens.toLocaleString()} out`,
  ];
  if (usage.cacheReadTokens) parts.push(`${usage.cacheReadTokens.toLocaleString()} cached`);
  return parts.join(' · ');
}

type Props = {
  messages: ChatMessage[];
  running: boolean;
  error?: string;
  usage?: Usage;
  /** Shown after the last message, e.g. an approval prompt. */
  children?: ReactNode;
};

export default function MessageList({ messages, running, error, usage, children }: Props) {
  const results = resultsById(messages);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView?.({ block: 'end' });
  }, [messages, error, children]);

  return (
    <div className="messages" role="log" aria-live="polite">
      {messages.map((message, index) =>
        message.parts.map((part, partIndex) => {
          const key = `${index}-${partIndex}`;
          if (part.type === 'text' && part.text) {
            return (
              <div
                key={key}
                className={`bubble bubble-${message.role}`}
                data-testid={`${message.role}-text`}
              >
                {part.text}
              </div>
            );
          }
          if (part.type === 'tool_call') {
            return <ToolCard key={key} call={part} result={results.get(part.id)} />;
          }
          return null;
        }),
      )}
      {running && !children && <div className="working">Working…</div>}
      {children}
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      {usage && !running && (
        <div className="usage" data-testid="usage">
          {formatUsage(usage)}
        </div>
      )}
      <div ref={end} />
    </div>
  );
}
