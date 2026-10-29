import type { ProviderId } from '../providers/types';
import type { RunSummary } from '../workflows/types';

export const MIN_INTERVAL_MINUTES = 15;

/** What a schedule runs: a saved workflow, or a plain prompt for the agent. */
export type ScheduleRun =
  | { kind: 'workflow'; workflowId: string; variables: Record<string, string> }
  | { kind: 'prompt'; prompt: string; providerId: ProviderId; model: string };

/** `weekdays` and `day` use `Date.getDay()`: 0 is Sunday. Times are in the browser's time zone. */
export type ScheduleWhen =
  | { every: 'minutes'; minutes: number }
  | { every: 'day'; time: string; weekdays?: number[] }
  | { every: 'week'; day: number; time: string };

export type Schedule = {
  id: string;
  name: string;
  enabled: boolean;
  run: ScheduleRun;
  when: ScheduleWhen;
  /** Shown for reference; scheduled runs are full auto and ignore the allow list. */
  sites: string[];
  nextRunAt: number;
  lastRun?: RunSummary;
};

export const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
