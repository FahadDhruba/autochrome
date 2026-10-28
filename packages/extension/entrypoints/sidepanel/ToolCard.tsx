import type { Part } from '@/src/providers/types';
import { summarizeInput } from '@/src/toolSummary';

type ToolCall = Extract<Part, { type: 'tool_call' }>;
type ToolResult = Extract<Part, { type: 'tool_result' }>;

export default function ToolCard({ call, result }: { call: ToolCall; result?: ToolResult }) {
  const state = !result ? 'running' : result.isError ? 'error' : 'ok';
  const summary = summarizeInput(call.input);

  return (
    <details className={`tool-card tool-${state}`} data-testid="tool-card">
      <summary>
        <span className="tool-name">{call.name}</span>
        {summary && <span className="tool-summary">{summary}</span>}
        {state === 'running' && <span className="tool-state">running…</span>}
        {state === 'error' && <span className="tool-state">failed</span>}
      </summary>
      <div className="tool-body">
        {summary && <pre>{JSON.stringify(call.input, null, 2)}</pre>}
        {result?.content.map((item, index) =>
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
      </div>
    </details>
  );
}
