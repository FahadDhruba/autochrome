import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Circle, Download, Pencil, Play, Trash2, Upload } from 'lucide-react';
import IconButton from '@/src/ui/IconButton';
import { parseWorkflowJson, type Workflow } from '@autochrome/shared';
import { saveWorkflow, runStore, workflowStore } from '@/src/workflows/store';
import type { RecordingState } from '@/src/workflows/recording';
import ApprovalCard from '@/src/ui/ApprovalCard';
import type { ApprovalChoice, ApprovalRequest } from '@/src/safety/types';
import { formatTime } from './format';
import RunDialog from './RunDialog';
import RunLog from './RunLog';
import WorkflowEditor from './WorkflowEditor';
import { controlRecording } from './useRecording';
import { useStorageList } from './useStorageList';
import { viewOf, type useWorkflowRun } from './useWorkflowRun';

export type WorkflowScreen =
  { name: 'list' } | { name: 'edit'; id: string } | { name: 'run'; id: string } | { name: 'log' };

type Props = {
  screen: WorkflowScreen;
  onScreen: (screen: WorkflowScreen) => void;
  run: ReturnType<typeof useWorkflowRun>;
  recording: RecordingState | undefined;
  approval?: ApprovalRequest;
  onApproval: (choice: ApprovalChoice) => void;
  onStop: () => void;
};

function download(workflow: Workflow): void {
  const blob = new Blob([JSON.stringify(workflow, null, 2)], { type: 'application/json' });
  const link = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(blob),
    download: `${workflow.name.replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '') || 'workflow'}.json`,
  });
  link.click();
  URL.revokeObjectURL(link.href);
}

const STATUS_LABEL = {
  ok: 'ok',
  repaired: 'repaired',
  failed: 'failed',
  stopped: 'stopped',
} as const;

const when = formatTime;

export default function WorkflowsView(props: Props) {
  const { screen, onScreen, run, recording, approval, onApproval, onStop } = props;
  const workflows = useStorageList(
    useCallback(() => workflowStore.list(), []),
    'workflow:',
  );
  const runs = useStorageList(
    useCallback(() => runStore.list(), []),
    'run:',
  );
  const [message, setMessage] = useState<string>();
  const fileInput = useRef<HTMLInputElement>(null);

  const open = async (id: string): Promise<Workflow | undefined> => workflowStore.load(id);

  const backToList = useCallback(() => onScreen({ name: 'list' }), [onScreen]);

  const approvalCard = approval && <ApprovalCard request={approval} onAnswer={onApproval} />;

  const startRun = (workflow: Workflow, variables: Record<string, string>) => {
    run.start(workflow.id, workflow.name, variables);
    onScreen({ name: 'log' });
  };

  const runWorkflow = async (id: string) => {
    const workflow = await open(id);
    if (!workflow) return;
    if (workflow.variables.length > 0) return onScreen({ name: 'run', id });
    startRun(workflow, {});
  };

  const record = async () => {
    setMessage(undefined);
    const result = await controlRecording('start');
    if (!result.ok) setMessage(result.error);
  };

  const importFile = async (file: File) => {
    const parsed = parseWorkflowJson(await file.text());
    if (!parsed.ok) return setMessage(parsed.error);
    // Never overwrite a workflow of yours that happens to share the id.
    const taken = await workflowStore.load(parsed.workflow.id);
    const workflow = taken ? { ...parsed.workflow, id: crypto.randomUUID() } : parsed.workflow;
    await saveWorkflow(workflow);
    setMessage(`Imported “${workflow.name}”.`);
  };

  if (screen.name === 'edit' || screen.name === 'run') {
    return (
      <Loaded id={screen.id} onMissing={backToList}>
        {(workflow) =>
          screen.name === 'edit' ? (
            <WorkflowEditor
              key={workflow.id}
              workflow={workflow}
              onRun={(w) => void runWorkflow(w.id)}
              onExport={download}
              onClose={backToList}
            />
          ) : (
            <RunDialog
              workflow={workflow}
              onRun={(variables) => startRun(workflow, variables)}
              onCancel={backToList}
            />
          )
        }
      </Loaded>
    );
  }

  if (screen.name === 'log' && run.run) {
    return (
      <div className="workflows">
        <RunLog run={run.run} onStop={onStop} onBack={backToList} />
        {approvalCard}
      </div>
    );
  }

  return (
    <div className="workflows">
      <div className="wf-toolbar">
        <h2>Workflows</h2>
        <div className="button-row">
          <button
            className="with-icon"
            disabled={recording !== undefined}
            onClick={() => void record()}
          >
            <Circle size={14} fill="var(--recording)" color="var(--recording)" aria-hidden="true" />
            Record
          </button>
          <IconButton
            label="Import"
            icon={Upload}
            align="end"
            onClick={() => fileInput.current?.click()}
          />
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            hidden
            aria-label="Import workflow file"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) void importFile(file);
            }}
          />
        </div>
      </div>
      {message && (
        <p className="muted" role="status">
          {message}
        </p>
      )}
      {workflows?.length === 0 && (
        <p className="muted">
          No workflows yet. Press Record and do the task yourself, or save a finished chat as a
          workflow.
        </p>
      )}
      <ul className="wf-list">
        {workflows?.map((workflow) => (
          <li key={workflow.id} className="wf-item" data-testid="workflow-item">
            <div className="wf-item-main">
              <strong>{workflow.name}</strong>
              <span className="muted">{workflow.steps} steps</span>
            </div>
            <div className="wf-item-actions">
              <IconButton
                label={`Run ${workflow.name}`}
                icon={Play}
                disabled={run.running}
                onClick={() => void runWorkflow(workflow.id)}
              />
              <IconButton
                label={`Edit ${workflow.name}`}
                icon={Pencil}
                onClick={() => onScreen({ name: 'edit', id: workflow.id })}
              />
              <IconButton
                label={`Export ${workflow.name}`}
                icon={Download}
                onClick={() => void open(workflow.id).then((w) => w && download(w))}
              />
              <IconButton
                label={`Delete ${workflow.name}`}
                icon={Trash2}
                tone="danger"
                align="end"
                onClick={() => void workflowStore.remove(workflow.id)}
              />
            </div>
          </li>
        ))}
      </ul>
      {run.run && (
        <button className="link" onClick={() => onScreen({ name: 'log' })}>
          Show the last run
        </button>
      )}
      {runs && runs.length > 0 && (
        <>
          <h3>Recent runs</h3>
          <ul className="wf-list">
            {runs.slice(0, 8).map((summary) => (
              <li key={summary.id} className="wf-item">
                <button
                  className="wf-run-item"
                  onClick={() =>
                    void runStore.load(summary.id).then((full) => {
                      if (!full) return;
                      run.setRun(viewOf(full));
                      onScreen({ name: 'log' });
                    })
                  }
                >
                  <span>{summary.workflowName}</span>
                  <span className={`wf-status wf-status-${summary.status}`}>
                    {STATUS_LABEL[summary.status]}
                  </span>
                  <span className="muted">{when(summary.startedAt)}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {approvalCard}
    </div>
  );
}

/** Loads a workflow by id for its children; goes back to the list when it is gone. */
function Loaded({
  id,
  onMissing,
  children,
}: {
  id: string;
  onMissing: () => void;
  children: (workflow: Workflow) => ReactNode;
}) {
  const [loaded, setLoaded] = useState<Workflow>();

  useEffect(() => {
    let current = true;
    void workflowStore.load(id).then((workflow) => {
      if (!current) return;
      if (workflow) setLoaded(workflow);
      else onMissing();
    });
    return () => {
      current = false;
    };
  }, [id, onMissing]);

  return loaded?.id === id ? <>{children(loaded)}</> : null;
}
