import { useId, useState, type ComponentType } from 'react';
import {
  AppWindow,
  Bug,
  ChevronRight,
  Eye,
  LoaderCircle,
  MousePointerClick,
  Workflow,
  type LucideProps,
} from 'lucide-react';
import type { Part } from '@/src/providers/types';
import { summarizeInput, summarizeResult, toolGroup, type ToolGroup } from '@/src/toolSummary';

type ToolCall = Extract<Part, { type: 'tool_call' }>;
type ToolResult = Extract<Part, { type: 'tool_result' }>;

const GROUP_ICON: Record<ToolGroup, ComponentType<LucideProps>> = {
  tabs: AppWindow,
  read: Eye,
  input: MousePointerClick,
  debug: Bug,
  workflow: Workflow,
};

type Props = {
  call: ToolCall;
  result?: ToolResult;
  /** This call is waiting for the user to allow it, so its details are shown. */
  awaitingApproval?: boolean;
};

/**
 * One tool call as a single row (icon, name, input, result) that opens to the full input and
 * result. Failed and waiting calls start open; a click always wins over that default.
 */
export default function ToolCard({ call, result, awaitingApproval = false }: Props) {
  const state = !result ? 'running' : result.isError ? 'error' : 'ok';
  const [toggled, setToggled] = useState<boolean>();
  const open = toggled ?? (state === 'error' || awaitingApproval);
  const bodyId = useId();
  const Icon = GROUP_ICON[toolGroup(call.name)];
  const input = summarizeInput(call.input);
  const resultText = result ? summarizeResult(call.name, result.content, result.isError) : '';
  const thumbnail = result?.content.find((item) => item.type === 'image');

  return (
    <div className={`tool-card tool-${state}`} data-testid="tool-card">
      <button
        type="button"
        className="tool-head"
        aria-expanded={open}
        aria-controls={open ? bodyId : undefined}
        onClick={() => setToggled(!open)}
      >
        <Icon className="tool-icon" size={14} aria-hidden="true" />
        <span className="tool-name">{call.name}</span>
        <span className="tool-summary">{input}</span>
        <span className="tool-result-sum">
          {state === 'running' && (
            <>
              <LoaderCircle className="spin" size={14} aria-hidden="true" />
              <span className="sr-only">
                {awaitingApproval ? 'Waiting for approval' : 'Running'}
              </span>
            </>
          )}
          {thumbnail?.type === 'image' && (
            <img
              className="tool-thumb"
              src={`data:${thumbnail.mimeType};base64,${thumbnail.data}`}
              alt=""
            />
          )}
          {resultText && <span className="tool-result-text">{resultText}</span>}
        </span>
        <ChevronRight className="tool-chevron" size={14} aria-hidden="true" />
      </button>
      {open && (
        <div className="tool-body" id={bodyId}>
          {input && (
            <>
              <div className="tool-label">Input</div>
              <pre>{JSON.stringify(call.input, null, 2)}</pre>
            </>
          )}
          {result && (
            <>
              <div className="tool-label">Result</div>
              {result.content.map((item, index) =>
                item.type === 'text' ? (
                  <pre key={index} className="tool-result">
                    {item.text}
                  </pre>
                ) : (
                  <img
                    key={index}
                    className="tool-image"
                    src={`data:${item.mimeType};base64,${item.data}`}
                    alt="Screenshot"
                  />
                ),
              )}
            </>
          )}
          {!result && <div className="tool-label">Waiting for a result…</div>}
        </div>
      )}
    </div>
  );
}
