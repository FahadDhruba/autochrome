import { useCallback, useEffect, useState } from 'react';
import EmptyState from '@/src/ui/EmptyState';
import IconButton from '@/src/ui/IconButton';
import { ArrowLeft, History } from 'lucide-react';
import { runStore } from '@/src/workflows/store';
import { triggerOf } from '@/src/workflows/types';
import { formatTime, TRIGGER_LABEL } from './format';
import RunLog from './RunLog';
import { useStorageList } from './useStorageList';
import { viewOf, type RunView } from './useWorkflowRun';

type Props = {
  /** The run being shown, or undefined for the list. */
  selected: string | undefined;
  onSelect: (runId: string | undefined) => void;
  onOpenChat: (chatId: string) => void;
};

/** Every run, whoever started it: you, a schedule or a bridge caller. Newest first, last 200. */
export default function RunsView({ selected, onSelect, onOpenChat }: Props) {
  const runs = useStorageList(
    useCallback(() => runStore.list(), []),
    'run:',
  );
  const [loaded, setLoaded] = useState<{ id: string; view: RunView | null }>();

  useEffect(() => {
    if (!selected) return;
    let current = true;
    void runStore.load(selected).then((run) => {
      if (current) setLoaded({ id: selected, view: run ? viewOf(run) : null });
    });
    return () => {
      current = false;
    };
  }, [selected]);

  if (selected) {
    const view = loaded?.id === selected ? loaded.view : undefined;
    if (view === undefined) return null;
    if (view === null) {
      return (
        <div className="workflows">
          <p className="muted">This run is no longer in the log.</p>
          <IconButton label="Back to runs" icon={ArrowLeft} onClick={() => onSelect(undefined)} />
        </div>
      );
    }
    return (
      <div className="workflows">
        <RunLog
          run={view}
          onStop={() => {}}
          onBack={() => onSelect(undefined)}
          backLabel="Back to runs"
          onOpenChat={onOpenChat}
        />
      </div>
    );
  }

  return (
    <div className="workflows">
      <div className="wf-toolbar">
        <h2>Runs</h2>
      </div>
      {runs?.length === 0 && (
        <EmptyState testId="runs-empty" visual={<History size={40} strokeWidth={1.5} />}>
          No runs yet. Workflow, schedule and bridge runs show up here.
        </EmptyState>
      )}
      <ul className="wf-list">
        {runs?.map((run) => (
          <li key={run.id} className="wf-item" data-testid="run-item">
            <button className="wf-run-item" onClick={() => onSelect(run.id)}>
              <span className="run-name">
                {run.scheduleName ?? run.workflowName}
                <span className="muted run-meta">
                  {TRIGGER_LABEL[triggerOf(run)]}
                  {run.kind === 'prompt' ? ' · prompt' : ''} · {formatTime(run.startedAt)}
                </span>
              </span>
              <span className={`wf-status wf-status-${run.status}`}>{run.status}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
