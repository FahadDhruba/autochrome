import { useState } from 'react';
import {
  toolDefinitions,
  toolNames,
  type ExecuteMessage,
  type ToolContent,
  type ToolName,
  type ToolResult,
} from '@autochrome/shared';
import { examples } from './examples';

type HistoryEntry = { name: ToolName; input: string; result: ToolResult };

const MAX_HISTORY = 10;
const pretty = (value: object) => JSON.stringify(value, null, 2);

function Content({ item }: { item: ToolContent }) {
  return item.type === 'text' ? (
    <pre>{item.text}</pre>
  ) : (
    <img src={`data:${item.mimeType};base64,${item.data}`} alt="screenshot" />
  );
}

export default function App() {
  const [name, setName] = useState<ToolName>('tabs_list');
  const [input, setInput] = useState(pretty(examples.tabs_list));
  const [running, setRunning] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [shown, setShown] = useState(0);

  const choose = (next: ToolName) => {
    setName(next);
    setInput(pretty(examples[next]));
  };

  const run = async () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(input);
    } catch (error) {
      const result: ToolResult = {
        id: '',
        ok: false,
        content: [{ type: 'text', text: `Input is not valid JSON: ${String(error)}` }],
      };
      setHistory((h) => [{ name, input, result }, ...h].slice(0, MAX_HISTORY));
      setShown(0);
      return;
    }
    setRunning(true);
    const message: ExecuteMessage = {
      type: 'autochrome:execute',
      call: { id: crypto.randomUUID(), name, input: parsed },
    };
    const result = (await browser.runtime.sendMessage(message)) as ToolResult;
    setRunning(false);
    setHistory((h) => [{ name, input, result }, ...h].slice(0, MAX_HISTORY));
    setShown(0);
  };

  const entry = history[shown];

  return (
    <main>
      <h1>autochrome tool debugger</h1>
      <label>
        Tool{' '}
        <select value={name} onChange={(e) => choose(e.target.value as ToolName)}>
          {toolNames.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
      <p className="description">{toolDefinitions[name].description}</p>
      <textarea
        aria-label="Tool input (JSON)"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        rows={8}
        spellCheck={false}
      />
      <button onClick={run} disabled={running}>
        {running ? 'Running…' : 'Run'}
      </button>

      {entry && (
        <section aria-label="Result">
          <h2>
            {entry.name} {entry.result.ok ? 'ok' : 'failed'}
          </h2>
          {entry.result.content.map((item, i) => (
            <Content key={i} item={item} />
          ))}
        </section>
      )}

      {history.length > 0 && (
        <section aria-label="History">
          <h2>History</h2>
          <ol>
            {history.map((h, i) => (
              <li key={i}>
                <button className="link" onClick={() => setShown(i)}>
                  {h.name} {h.result.ok ? 'ok' : 'failed'}: {h.input.replace(/\s+/g, ' ')}
                </button>
              </li>
            ))}
          </ol>
        </section>
      )}
    </main>
  );
}
