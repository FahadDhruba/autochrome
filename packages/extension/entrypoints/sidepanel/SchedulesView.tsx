import { useCallback, useState } from 'react';
import { Pencil, Play, Plus, Trash2 } from 'lucide-react';
import IconButton from '@/src/ui/IconButton';
import { describeWhen, nextRunAfter } from '@/src/schedules/next-run';
import { RUN_NOW_MESSAGE, type RunNowResponse } from '@/src/schedules/messages';
import { patchSchedule, scheduleStore } from '@/src/schedules/store';
import type { Schedule } from '@/src/schedules/types';
import { formatTime } from './format';
import ScheduleEditor from './ScheduleEditor';
import type { ProviderState } from './useProviderSettings';
import { useStorageList } from './useStorageList';

export type ScheduleScreen = { name: 'list' } | { name: 'edit'; id: string | undefined };

type Props = {
  screen: ScheduleScreen;
  onScreen: (screen: ScheduleScreen) => void;
  providers: ProviderState | undefined;
  /** Shows a run in the Runs view. */
  onOpenRun: (runId: string) => void;
};

const RESULT_LABEL = {
  ok: 'ok',
  repaired: 'ok, repaired by AI',
  failed: 'failed',
  stopped: 'stopped',
} as const;

function lastResult(schedule: Schedule): string {
  const { lastRun } = schedule;
  return lastRun ? `${RESULT_LABEL[lastRun.status]} · ${formatTime(lastRun.finishedAt)}` : '';
}

export default function SchedulesView({ screen, onScreen, providers, onOpenRun }: Props) {
  const schedules = useStorageList(
    useCallback(() => scheduleStore.list(), []),
    'schedule:',
  );
  const [running, setRunning] = useState<string>();
  const [message, setMessage] = useState<string>();
  // The switch moves at once; the saved value follows through storage.
  const [toggled, setToggled] = useState<Record<string, boolean>>({});

  const backToList = useCallback(() => onScreen({ name: 'list' }), [onScreen]);

  const setEnabled = async (schedule: Schedule, enabled: boolean) => {
    setToggled((current) => ({ ...current, [schedule.id]: enabled }));
    // Turning a schedule on works out its next run from now, so it never fires for a missed time.
    await patchSchedule(schedule.id, {
      enabled,
      ...(enabled && { nextRunAt: nextRunAfter(schedule.when, Date.now()) }),
    });
    setToggled((current) => {
      const rest = { ...current };
      delete rest[schedule.id];
      return rest;
    });
  };

  const runNow = async (schedule: Schedule) => {
    setMessage(undefined);
    setRunning(schedule.id);
    try {
      const response = (await browser.runtime.sendMessage({
        type: RUN_NOW_MESSAGE,
        id: schedule.id,
      })) as RunNowResponse | undefined;
      if (response && !response.ran) setMessage(response.reason);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setRunning(undefined);
    }
  };

  if (screen.name === 'edit') {
    const existing = screen.id ? schedules?.find((s) => s.id === screen.id) : undefined;
    if (screen.id && !schedules) return null;
    return <ScheduleEditor schedule={existing} providers={providers} onClose={backToList} />;
  }

  const sorted = [...(schedules ?? [])].sort(
    (a, b) => Number(b.enabled) - Number(a.enabled) || a.nextRunAt - b.nextRunAt,
  );

  return (
    <div className="workflows">
      <div className="wf-toolbar">
        <h2>Schedules</h2>
        <button className="with-icon" onClick={() => onScreen({ name: 'edit', id: undefined })}>
          <Plus size={14} aria-hidden="true" />
          New schedule
        </button>
      </div>
      <p className="muted">
        Runs happen while Chrome is open. A run missed while it was closed happens once at the next
        start.
      </p>
      {message && (
        <p className="muted" role="status">
          {message}
        </p>
      )}
      {schedules?.length === 0 && (
        <p className="muted">
          No schedules yet. Pick a saved workflow or write a prompt, and choose when it runs.
        </p>
      )}
      <ul className="wf-list">
        {sorted.map((schedule) => (
          <li key={schedule.id} className="wf-item sched-item" data-testid="schedule-item">
            <div className="wf-item-main">
              <strong>{schedule.name}</strong>
              <span className="muted">
                {schedule.run.kind === 'prompt' ? 'AI prompt' : 'Workflow'} ·{' '}
                {describeWhen(schedule.when)}
              </span>
              <span className="muted" data-testid="schedule-next">
                {schedule.enabled ? `Next: ${formatTime(schedule.nextRunAt)}` : 'Disabled'}
              </span>
              {schedule.lastRun && (
                <button
                  className="link sched-last"
                  data-testid="schedule-last"
                  onClick={() => onOpenRun(schedule.lastRun!.id)}
                >
                  Last: {lastResult(schedule)}
                </button>
              )}
            </div>
            <div className="wf-item-actions">
              <label className="sched-toggle">
                <input
                  type="checkbox"
                  checked={toggled[schedule.id] ?? schedule.enabled}
                  aria-label={`Enable ${schedule.name}`}
                  onChange={(event) => void setEnabled(schedule, event.target.checked)}
                />
                On
              </label>
              <IconButton
                label={`Run ${schedule.name} now`}
                icon={Play}
                disabled={running !== undefined}
                onClick={() => void runNow(schedule)}
              />
              <IconButton
                label={`Edit ${schedule.name}`}
                icon={Pencil}
                onClick={() => onScreen({ name: 'edit', id: schedule.id })}
              />
              <IconButton
                label={`Delete ${schedule.name}`}
                icon={Trash2}
                tone="danger"
                align="end"
                onClick={() => void scheduleStore.remove(schedule.id)}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
