import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, ChevronRight, CircleAlert, Copy, LoaderCircle, Paperclip } from 'lucide-react';
import { splitAttachmentNote } from '@/src/attachments';
import type { ChatMessage, Part, Usage } from '@/src/providers/types';
import { describeStep } from '@/src/stepLabel';
import Markdown from './Markdown';
import ToolCard from './ToolCard';

type ToolCall = Extract<Part, { type: 'tool_call' }>;
type ToolResult = Extract<Part, { type: 'tool_result' }>;

type Item =
  { kind: 'text'; text: string; key: string } | { kind: 'step'; call: ToolCall; key: string };

/** One user prompt, or everything the agent did in reply: steps (with notes) and its answer. */
type Turn =
  | { kind: 'user'; text: string; key: string }
  | { kind: 'agent'; activity: Item[]; answer: Item[]; key: string };

function resultsById(messages: ChatMessage[]): Map<string, ToolResult> {
  const results = new Map<string, ToolResult>();
  for (const part of messages.flatMap((message) => message.parts)) {
    if (part.type === 'tool_result') results.set(part.callId, part);
  }
  return results;
}

/** Groups the history into turns; text after the agent's last step is its answer. */
function toTurns(messages: ChatMessage[]): Turn[] {
  const turns: Turn[] = [];
  let items: Item[] = [];
  const flush = () => {
    if (items.length === 0) return;
    const lastStep = items.findLastIndex((item) => item.kind === 'step');
    turns.push({
      kind: 'agent',
      activity: items.slice(0, lastStep + 1),
      answer: items.slice(lastStep + 1),
      key: items[0]!.key,
    });
    items = [];
  };
  messages.forEach((message, index) =>
    message.parts.forEach((part, partIndex) => {
      const key = `${index}-${partIndex}`;
      if (message.role === 'user' && part.type === 'text' && part.text && !part.volatile) {
        flush();
        turns.push({ kind: 'user', text: part.text, key });
      } else if (message.role === 'assistant' && part.type === 'text' && part.text) {
        items.push({ kind: 'text', text: part.text, key });
      } else if (part.type === 'tool_call') {
        items.push({ kind: 'step', call: part, key });
      }
    }),
  );
  flush();
  return turns;
}

function formatUsage(usage: Usage): string {
  const parts = [
    `${usage.inputTokens.toLocaleString()} in`,
    `${usage.outputTokens.toLocaleString()} out`,
  ];
  if (usage.cacheReadTokens) parts.push(`${usage.cacheReadTokens.toLocaleString()} cached`);
  return parts.join(' · ');
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="icon-link"
      aria-label={copied ? 'Copied' : 'Copy answer'}
      title={copied ? 'Copied' : 'Copy answer'}
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
    >
      {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
    </button>
  );
}

type ActivityProps = {
  items: Item[];
  results: Map<string, ToolResult>;
  pendingId?: string;
  /** Open unless the user closes it; older turns start closed. */
  defaultOpen: boolean;
};

/** The agent's steps in one turn, as a timeline that folds into "7 steps". */
function Activity({ items, results, pendingId, defaultOpen }: ActivityProps) {
  const steps = items.filter((item) => item.kind === 'step');
  const failed = steps.some((step) => step.kind === 'step' && results.get(step.call.id)?.isError);
  const running = steps.some((step) => step.kind === 'step' && !results.has(step.call.id));
  const [toggled, setToggled] = useState<boolean>();
  const open = toggled ?? (defaultOpen || failed || pendingId !== undefined);
  const count = `${steps.length} step${steps.length === 1 ? '' : 's'}`;

  return (
    <section className="activity" aria-label="Agent steps">
      <button
        type="button"
        className="activity-head"
        aria-expanded={open}
        onClick={() => setToggled(!open)}
      >
        {running ? (
          <LoaderCircle className="spin" size={14} aria-hidden="true" />
        ) : failed ? (
          <CircleAlert size={14} aria-hidden="true" />
        ) : (
          <Check size={14} aria-hidden="true" />
        )}
        <span>{running ? `Working · ${count}` : count}</span>
        <ChevronRight className="activity-chevron" size={14} aria-hidden="true" />
      </button>
      {open && (
        <ol className="activity-list">
          {items.map((item) =>
            item.kind === 'text' ? (
              <li key={item.key} className="activity-note" data-testid="assistant-text">
                <Markdown text={item.text} />
              </li>
            ) : (
              <li key={item.key}>
                <ToolCard
                  call={item.call}
                  result={results.get(item.call.id)}
                  awaitingApproval={item.call.id === pendingId}
                />
              </li>
            ),
          )}
        </ol>
      )}
    </section>
  );
}

type Props = {
  messages: ChatMessage[];
  running: boolean;
  error?: string;
  usage?: Usage;
  /** An approval prompt is waiting; it belongs to the newest call that has no result yet. */
  awaitingApproval?: boolean;
  /** Shown after the last message, e.g. an approval prompt. */
  children?: ReactNode;
};

export default function MessageList({
  messages,
  running,
  error,
  usage,
  awaitingApproval,
  children,
}: Props) {
  const results = resultsById(messages);
  const calls = messages
    .flatMap((message) => message.parts)
    .filter((part): part is ToolCall => part.type === 'tool_call');
  const unfinished = calls.findLast((call) => !results.has(call.id));
  const pendingId = awaitingApproval ? unfinished?.id : undefined;
  const turns = toTurns(messages);
  const lastAgent = turns.findLastIndex((turn) => turn.kind === 'agent');
  const stepCount = (turn: Turn) =>
    turn.kind === 'agent' ? turn.activity.filter((item) => item.kind === 'step').length : 0;
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView?.({ block: 'end' });
  }, [messages, error, children]);

  return (
    <div className="messages" role="log" aria-live="polite">
      {turns.map((turn, index) => {
        if (turn.kind === 'user') {
          const { text, files } = splitAttachmentNote(turn.text);
          return (
            <div key={turn.key} className="bubble bubble-user" data-testid="user-text">
              {text}
              {files.length > 0 && (
                <ul className="file-chips bubble-files" aria-label="Attached files">
                  {files.map((name) => (
                    <li key={name} className="file-chip">
                      <Paperclip size={12} aria-hidden="true" />
                      <span>{name}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        }
        const answer = turn.answer
          .map((item) => (item.kind === 'text' ? item.text : ''))
          .join('\n\n');
        return (
          <div key={turn.key} className="turn">
            {turn.activity.length > 0 && (
              <Activity
                items={turn.activity}
                results={results}
                pendingId={pendingId}
                defaultOpen={index === lastAgent}
              />
            )}
            {turn.answer.map(
              (item) =>
                item.kind === 'text' && (
                  <div
                    key={item.key}
                    className="bubble bubble-assistant"
                    data-testid="assistant-text"
                  >
                    <Markdown text={item.text} />
                  </div>
                ),
            )}
            {answer && !(running && index === lastAgent) && (
              <div className="answer-meta">
                <CopyButton text={answer} />
                {stepCount(turn) > 0 && <span>{stepCount(turn)} steps</span>}
              </div>
            )}
          </div>
        );
      })}
      {running && !children && (
        <div className="working" role="status">
          <LoaderCircle className="spin" size={14} aria-hidden="true" />
          {unfinished ? `${describeStep(unfinished)}…` : 'Thinking…'}
        </div>
      )}
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
